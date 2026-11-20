import { createHash } from 'node:crypto'
import { getNotionToken } from '../notion/env.js'
import { notionFetch, NOTION_API_BASE } from './notion-fetch.mjs'
import { listGitHubPosts } from './github-posts.mjs'

// Keep admin writes on the version that supports the Markdown API. Public readers
// retain their existing version and database compatibility settings.
const API_VERSION = '2026-03-11'
const LEGACY_DATABASE_VERSION = '2022-06-28'
const MAX_CONTENT_LENGTH = 60000
const TEXT_TYPES = ['rich_text']

export class NotionContentError extends Error {
  constructor (message, status = 502, details = {}) {
    super(message)
    this.name = 'NotionContentError'
    this.status = status
    this.httpStatus = details.httpStatus
    this.notionCode = details.notionCode
    this.writeStage = details.writeStage
    this.writeRejected = details.writeRejected === true
    this.writeUncertain = details.writeUncertain === true
  }
}

export function isNotionWriteConfigured () {
  return Boolean(getNotionToken() && (normalizeId(process.env.NOTION_DATA_SOURCE_ID) || normalizeId(process.env.NOTION_DATABASE_ID)))
}

export async function listAdminNotionPosts () {
  if (!isNotionWriteConfigured()) return []
  const context = await loadContext()
  const pages = []
  let cursor
  do {
    const data = await request(context, context.queryPath, {
      method: 'POST', body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }, notionVersion: context.queryVersion
    })
    pages.push(...(data.results || []))
    cursor = data.has_more ? data.next_cursor : null
    if (data.has_more && !cursor) throw new NotionContentError('Notion 返回的文章分页不完整，请重试。')
  } while (cursor)
  return pages.filter(page => isArticle(page) && !page.archived && !page.in_trash).map(page => mapPage(page, context))
}

export async function getAdminNotionPost (pageId) {
  const context = await loadContext()
  return readDocument(context, requireId(pageId))
}

export async function updateNotionPost (pageId, input) {
  const context = await loadContext()
  const id = requireId(pageId)
  const current = await readDocument(context, id)
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  if (!value.expectedRevision || value.expectedRevision !== current.post.revision) {
    throw new NotionContentError('这篇文章已在 Notion 或其他窗口中修改，请重新载入线上版本后合并修改。', 409)
  }

  const properties = buildProperties(current.post, value, context)
  let content = value.content === undefined ? current.content : value.content
  if (typeof content !== 'string') throw new NotionContentError('正文必须是文本。', 400)
  content = refreshFileUrls(content, current.content)
  const bodyChanged = normalizeFileUrls(content) !== normalizeFileUrls(current.content)
  if (bodyChanged) {
    if (!current.post.contentEditable) throw new NotionContentError(current.post.contentWarning, 400)
    if (content.length > MAX_CONTENT_LENGTH) throw new NotionContentError('正文不能超过 60000 个字符。', 400)
    const protectedReason = getContentWarning({ markdown: content })
    if (protectedReason) throw new NotionContentError('请在 Notion 中插入或修改子页面、同步块等特殊内容。', 400)
  }
  if (!(value.draft ?? current.post.draft) && current.post.contentEditable && !content.trim()) {
    throw new NotionContentError('已发布文章必须有正文。', 400)
  }

  if (value.slug !== undefined && value.slug.trim() !== current.post.slug) {
    const [notionPosts, githubPosts] = await Promise.all([listAdminNotionPosts(), listGitHubPosts({ includeDrafts: true })])
    if ([...notionPosts, ...githubPosts].some(post => post.id !== current.post.id && String(post.slug || '').toLowerCase() === value.slug.trim().toLowerCase())) {
      throw new NotionContentError('该 Slug 已被另一篇文章使用，请换一个文章地址。', 400)
    }
  }

  const propertiesChanged = Object.keys(properties).length > 0
  const contentUpdates = bodyChanged && current.content
    ? buildNotionContentUpdates(current.content, content)
    : []
  let bodyAttempted = false
  let bodyWritten = false
  let propertiesAttempted = false
  let propertiesWritten = false
  try {
    const warnings = []
    if (bodyChanged) {
      bodyAttempted = true
      // One exact match also protects against body edits made since the read.
      // Never authorize deletion of child pages or databases.
      const result = await request(context, '/pages/' + id + '/markdown', {
        method: 'PATCH',
        writeStage: 'body',
        body: {
          markdown_version: 'v2',
          ...(current.content
            ? { type: 'update_content', update_content: { content_updates: contentUpdates, allow_deleting_content: false } }
            : { type: 'replace_content', replace_content: { new_str: content, allow_deleting_content: false } })
        }
      })
      bodyWritten = true
      if (result.warnings?.length) warnings.push('Notion 对部分正文格式作了调整，请检查保存后的内容。')
    }
    if (propertiesChanged) {
      propertiesAttempted = true
      await request(context, '/pages/' + id, { method: 'PATCH', writeStage: 'properties', body: { properties } })
      propertiesWritten = true
    }
    const saved = bodyAttempted || propertiesAttempted ? await readDocument(context, id) : current
    return { ...saved, previousSlug: current.post.slug, previousTags: current.post.tags, warnings }
  } catch (error) {
    if (bodyAttempted && !bodyWritten) {
      // A network error or 5xx may happen after Notion accepted the write. A
      // validation response, however, definitively means the body was rejected.
      if (error?.writeUncertain) {
        const failure = createUncertainWriteError(error)
        failure.changedPosts = [current.post, { slug: value.slug, tags: value.tags }]
        throw failure
      }
      throw createRejectedWriteError(error, '正文未保存' + (propertiesChanged ? '，文章属性也未保存' : '') + '。', 400)
    }

    if (propertiesAttempted && !propertiesWritten) {
      if (error?.writeUncertain) {
        const failure = createUncertainWriteError(error)
        failure.changedPosts = [current.post, { slug: value.slug, tags: value.tags }]
        throw failure
      }
      const message = bodyWritten
        ? '正文已保存，但文章属性未保存' + notionCodeSuffix(error) + '。请重新载入线上版本后核对。'
        : '文章属性未保存' + notionCodeSuffix(error) + '。'
      const failure = new NotionContentError(message, bodyWritten ? 409 : 400, notionErrorDetails(error))
      if (bodyWritten) failure.changedPosts = [current.post, { slug: value.slug, tags: value.tags }]
      throw failure
    }

    if (bodyWritten || propertiesWritten) {
      const failure = new NotionContentError(
        'Notion 已接收修改，但无法重新读取确认' + notionCodeSuffix(error) + '。请重新载入线上版本后核对。',
        409,
        { ...notionErrorDetails(error), writeUncertain: true }
      )
      failure.changedPosts = [current.post, { slug: value.slug, tags: value.tags }]
      throw failure
    }

    throw error
  }
}

function notionCodeSuffix (error) {
  return error?.notionCode ? '（' + error.notionCode + '）' : ''
}

function notionErrorDetails (error) {
  return {
    httpStatus: error?.httpStatus,
    notionCode: error?.notionCode,
    writeStage: error?.writeStage,
    writeRejected: error?.writeRejected,
    writeUncertain: error?.writeUncertain
  }
}

function createRejectedWriteError (error, message, status) {
  return new NotionContentError(
    'Notion 拒绝本次修改' + notionCodeSuffix(error) + '。' + message,
    status,
    { ...notionErrorDetails(error), writeRejected: true, writeUncertain: false }
  )
}

function createUncertainWriteError (error) {
  return new NotionContentError(
    'Notion 保存结果未确认' + notionCodeSuffix(error) + '。请重新载入线上版本后核对，不要直接重复提交。',
    409,
    { ...notionErrorDetails(error), writeUncertain: true }
  )
}

async function loadContext () {
  const token = getNotionToken()
  let sourceId = normalizeId(process.env.NOTION_DATA_SOURCE_ID)
  const databaseId = normalizeId(process.env.NOTION_DATABASE_ID)
  if (!token || (!sourceId && !databaseId)) {
    throw new NotionContentError('Notion 编辑需要配置 NOTION_API_KEY 和 NOTION_DATABASE_ID（或 NOTION_DATA_SOURCE_ID）。', 503)
  }
  const context = { token, databaseId, sourceId, queryVersion: API_VERSION }
  if (sourceId) {
    const schema = await request(context, '/data_sources/' + sourceId)
    context.schema = schema.properties || {}
    context.queryPath = '/data_sources/' + sourceId + '/query'
    context.databaseId = normalizeId(schema.parent?.database_id) || databaseId
    return context
  }

  // Existing deployments commonly configure only NOTION_DATABASE_ID. Keep
  // using the database API for those installations; data-source IDs are an
  // optional upgrade for databases with multiple sources.
  const database = await request(context, '/databases/' + databaseId, {
    notionVersion: LEGACY_DATABASE_VERSION
  })
  if (database.data_sources?.length === 1) {
    context.sourceId = requireId(database.data_sources[0].id)
    const schema = await request(context, '/data_sources/' + context.sourceId)
    context.schema = schema.properties || {}
    context.queryPath = '/data_sources/' + context.sourceId + '/query'
    context.databaseId = normalizeId(schema.parent?.database_id) || databaseId
    return context
  }
  if (!database.properties || typeof database.properties !== 'object') {
    throw new NotionContentError('无法读取博客数据库结构，请设置 NOTION_DATA_SOURCE_ID 后重试。', 503)
  }
  context.schema = database.properties
  context.queryPath = '/databases/' + databaseId + '/query'
  context.queryVersion = LEGACY_DATABASE_VERSION
  return context
}

async function readDocument (context, id) {
  const page = await request(context, '/pages/' + id)
  await assertPageScope(page, context)
  const markdown = await request(context, '/pages/' + id + '/markdown?markdown_version=v2')
  if (typeof markdown.markdown !== 'string') throw new NotionContentError('Notion 未返回完整的正文，请稍后重试。')
  const latest = await request(context, '/pages/' + id)
  await assertPageScope(latest, context)
  if (page.last_edited_time !== latest.last_edited_time) {
    throw new NotionContentError('读取期间文章发生了变化，请重新打开文章。', 409)
  }
  const contentWarning = getContentWarning(markdown)
  const post = mapPage(latest, context)
  post.contentEditable = !contentWarning
  post.contentWarning = contentWarning
  post.revision = createHash('sha256').update(normalizeFileUrls(JSON.stringify({
    id: latest.id, edited: latest.last_edited_time, properties: latest.properties,
    content: markdown.markdown, contentWarning
  }))).digest('hex')
  return { post, content: markdown.markdown }
}

async function assertPageScope (page, context) {
  const parent = page.parent || {}
  let belongs = false
  if (parent.type === 'data_source_id') {
    const parentSourceId = normalizeId(parent.data_source_id)
    belongs = context.sourceId
      ? parentSourceId === context.sourceId
      : parentSourceId && context.databaseId
        ? await dataSourceBelongsToDatabase(context, parentSourceId)
        : false
  } else if (parent.type === 'database_id') {
    belongs = normalizeId(parent.database_id) === context.databaseId
  }
  if (!belongs || !isArticle(page) || page.archived || page.in_trash) {
    throw new NotionContentError('只能编辑已配置博客数据库中的文章。', 404)
  }
}

async function dataSourceBelongsToDatabase (context, sourceId) {
  context.sourceDatabaseIds ||= new Map()
  if (context.sourceDatabaseIds.has(sourceId)) return context.sourceDatabaseIds.get(sourceId)
  let belongs = false
  try {
    const schema = await request(context, '/data_sources/' + sourceId)
    belongs = normalizeId(schema.parent?.database_id) === context.databaseId
  } catch (error) {
    if (error.status !== 404) throw error
  }
  context.sourceDatabaseIds.set(sourceId, belongs)
  return belongs
}

function isArticle (page) {
  const type = propertyValue(findProperty(page.properties, 'type'))
  return (Array.isArray(type) ? type : [type]).some(value => value === 'Post' || value === 'Page')
}

function mapPage (page, context) {
  const properties = page.properties || {}
  const read = name => propertyValue(findProperty(properties, name))
  const status = read('status')
  const statuses = Array.isArray(status) ? status : [status].filter(Boolean)
  const fields = {}
  for (const field of ['title', 'slug', 'summary', 'tags', 'date', 'draft']) {
    const schema = findProperty(context.schema, field === 'draft' ? 'status' : field)
    fields[field] = isWritableField(field, schema)
  }
  return {
    id: page.id,
    source: 'notion',
    notionPageId: page.id,
    notionUrl: 'https://www.notion.so/' + requireId(page.id).replace(/-/g, ''),
    title: String(read('title') || ''),
    slug: String(read('slug') || ''),
    summary: String(read('summary') || ''),
    tags: asArray(read('tags')),
    date: read('date') || page.created_time,
    draft: statuses[0] !== 'Published',
    status: statuses,
    type: asArray(read('type')),
    updatedAt: page.last_edited_time,
    editableFields: fields
  }
}

function buildProperties (post, input, context) {
  const result = {}
  for (const field of ['title', 'slug', 'summary', 'tags', 'date', 'draft']) {
    if (input[field] === undefined) continue
    let next = input[field]
    const previous = field === 'date' ? String(post.date || '').slice(0, 10) : post[field]
    if (field === 'tags') {
      if (!Array.isArray(next) || next.some(tag => typeof tag !== 'string')) throw new NotionContentError('标签格式无效。', 400)
      next = [...new Set(next.map(tag => tag.trim()).filter(Boolean))]
    } else if (field === 'draft') {
      if (typeof next !== 'boolean') throw new NotionContentError('发布状态无效。', 400)
    } else {
      if (typeof next !== 'string') throw new NotionContentError('文章字段格式无效。', 400)
      next = next.trim()
    }
    if (JSON.stringify(next) === JSON.stringify(previous)) continue
    if (!post.editableFields[field]) throw new NotionContentError('Notion 的 ' + field + ' 属性不存在或不能通过后台修改，请在 Notion 中修改。', 400)
    const schema = findProperty(context.schema, field === 'draft' ? 'status' : field)
    const key = schema.id
    if (field === 'title' && (!next || next.length > 180)) throw new NotionContentError('标题需要填写，且不能超过 180 个字符。', 400)
    if (field === 'summary' && next.length > 300) throw new NotionContentError('摘要不能超过 300 个字符。', 400)
    if (field === 'slug' && (!next || next.length > 180 || !/^[\p{L}\p{N}_-]+$/u.test(next))) throw new NotionContentError('Slug 需要填写，且只能包含文字、数字、连字符和下划线。', 400)
    if (field === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(next) || !Number.isFinite(Date.parse(next)) || new Date(next).toISOString().slice(0, 10) !== next)) throw new NotionContentError('日期格式无效。', 400)
    if (field === 'tags' && (next.length > 8 || next.some(tag => tag.length > 40))) throw new NotionContentError('最多使用 8 个标签，每个不超过 40 个字符。', 400)
    if (field === 'draft') next = next ? 'Draft' : 'Published'
    if (schema.type === 'title' || schema.type === 'rich_text') {
      result[key] = { [schema.type]: next ? [{ type: 'text', text: { content: next } }] : [] }
    } else if (schema.type === 'date') {
      result[key] = { date: { start: next } }
    } else if (schema.type === 'multi_select') {
      result[key] = { multi_select: asArray(next).map(name => ({ name })) }
    } else {
      result[key] = { [schema.type]: { name: next } }
    }
  }
  return result
}

function isWritableField (field, schema) {
  if (!schema?.id) return false
  if (field === 'title') return schema.type === 'title'
  if (field === 'tags') return schema.type === 'multi_select'
  if (field === 'date') return schema.type === 'date'
  if (field === 'draft') {
    if (!['select', 'multi_select', 'status'].includes(schema.type)) return false
    const options = schema[schema.type]?.options || []
    return ['Draft', 'Published'].every(name => options.some(option => option.name === name))
  }
  return TEXT_TYPES.includes(schema.type)
}

export function getContentWarning (document) {
  if (document.truncated || document.unknown_block_ids?.length) return '正文未能完整读取，请在 Notion 中编辑正文；后台仍可修改文章属性。'
  const content = String(document.markdown || '')
  if (content.length > MAX_CONTENT_LENGTH) return '正文超过后台编辑长度限制，请在 Notion 中编辑正文；后台仍可修改文章属性。'
  // These blocks cannot safely be recreated by the site's Markdown editor.
  if (/<(?:unknown|page|database|folder|synced-block(?:-reference)?|meeting-notes|custom-block)\b/i.test(content)) {
    return '正文包含子页面、同步块或其他特殊内容，请在 Notion 中编辑正文；后台仍可修改文章属性。'
  }
  return ''
}

// Notion-flavored Markdown includes a few markers that are parsed into native
// blocks. They are not article content the author should have to maintain by
// hand. Keep unchanged markers out of the edit request and reject changes to
// markers that can only be changed safely inside Notion.
const NOTION_BLOCK_MARKER_PATTERN = /<link-preview\b[^>]*\/\s*>|<image\b[^>]*\/\s*>|<p\b[^>]*\/\s*>|<toggle\b[^>]*>|<\/toggle\s*>/gi
const READ_ONLY_NOTION_MARKER_PATTERN = /^<(?:link-preview|image|p)\b/i
const MAX_CHARACTER_DIFF_DISTANCE = 400
const MAX_CONTENT_UPDATES = 100
const UPDATE_CONTEXT_MERGE_DISTANCE = 64

function getNotionMarkers (content) {
  NOTION_BLOCK_MARKER_PATTERN.lastIndex = 0
  return [...String(content || '').matchAll(NOTION_BLOCK_MARKER_PATTERN)].map(match => ({
    value: match[0],
    readOnly: READ_ONLY_NOTION_MARKER_PATTERN.test(match[0])
  }))
}

function sameMarkers (left, right, predicate = () => true) {
  const leftValues = left.filter(predicate).map(marker => marker.value)
  const rightValues = right.filter(predicate).map(marker => marker.value)
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index])
}

function splitNotionMarkers (content) {
  const parts = []
  let cursor = 0
  NOTION_BLOCK_MARKER_PATTERN.lastIndex = 0
  for (const match of String(content || '').matchAll(NOTION_BLOCK_MARKER_PATTERN)) {
    parts.push({ type: 'text', value: content.slice(cursor, match.index) })
    parts.push({ type: 'marker', value: match[0] })
    cursor = match.index + match[0].length
  }
  parts.push({ type: 'text', value: content.slice(cursor) })
  return parts
}

export function buildNotionContentUpdates (currentContent, nextContent) {
  const current = String(currentContent || '')
  const next = String(nextContent || '')
  if (current === next) return []

  const currentMarkers = getNotionMarkers(current)
  const nextMarkers = getNotionMarkers(next)
  const isReadOnly = marker => marker.readOnly
  if (!sameMarkers(currentMarkers, nextMarkers, isReadOnly)) {
    throw new NotionContentError('链接预览、图片和段落等 Notion 原生块的标记不能在这里修改，请直接修改其中的文字，或前往 Notion 调整块本身。', 400)
  }

  const updates = []
  if (sameMarkers(currentMarkers, nextMarkers)) {
    const currentParts = splitNotionMarkers(current)
    const nextParts = splitNotionMarkers(next)
    const needsWholeDocumentDiff = currentParts.some((part, index) => (
      part.type === 'text' && !part.value && nextParts[index].value
    ))
    if (needsWholeDocumentDiff) {
      // An empty text run between two adjacent native blocks has no local
      // anchor that can be made unique. Diff the whole document instead of
      // silently dropping the inserted text or asking for Markdown tags.
      updates.push(...buildTextContentUpdates(current, next, current))
    } else {
      for (let index = 0; index < currentParts.length; index++) {
        if (currentParts[index].type !== 'text') continue
        updates.push(...buildTextContentUpdates(currentParts[index].value, nextParts[index].value, current))
      }
    }
  } else {
    // Toggle tags are writable through the Markdown API. If the author added or
    // removed one with the editor command, diff the whole document so that the
    // toggle operation remains available while read-only markers stay intact.
    updates.push(...buildTextContentUpdates(current, next, current))
  }

  if (updates.length > MAX_CONTENT_UPDATES) {
    throw new NotionContentError('本次修改过于分散，请减少一次保存的修改点后重试。', 400)
  }
  return updates
}

function buildTextContentUpdates (current, next, fullContent) {
  if (current === next) return []
  const oldChars = Array.from(current)
  const newChars = Array.from(next)
  let prefix = 0
  while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix++
  let suffix = 0
  while (
    suffix < oldChars.length - prefix &&
    suffix < newChars.length - prefix &&
    oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]
  ) suffix++

  const oldMiddle = oldChars.slice(prefix, oldChars.length - suffix)
  const newMiddle = newChars.slice(prefix, newChars.length - suffix)
  let hunks
  if (!oldMiddle.length || !newMiddle.length) {
    hunks = [{ oldStart: prefix, oldEnd: prefix + oldMiddle.length, newStart: prefix, newEnd: prefix + newMiddle.length }]
  } else {
    hunks = diffCharacterHunks(oldMiddle, newMiddle)
    if (!hunks) hunks = [{ oldStart: 0, oldEnd: oldMiddle.length, newStart: 0, newEnd: newMiddle.length }]
    hunks = hunks.map(hunk => ({
      oldStart: hunk.oldStart + prefix,
      oldEnd: hunk.oldEnd + prefix,
      newStart: hunk.newStart + prefix,
      newEnd: hunk.newEnd + prefix
    }))
  }

  hunks = mergeCloseHunks(hunks, UPDATE_CONTEXT_MERGE_DISTANCE)
  return materializeContentHunks(oldChars, newChars, hunks, fullContent)
}

function materializeContentHunks (oldChars, newChars, hunks, fullContent) {
  if (hunks.length === 1) {
    const update = createContentUpdate(oldChars, newChars, hunks[0], 0, oldChars.length, fullContent)
    if (update) return [update]
    throw new NotionContentError('这段文字在 Notion 正文中重复出现，无法安全地只保存本次修改，请在 Notion 中编辑该段。', 400)
  }

  const updates = []
  for (let index = 0; index < hunks.length; index++) {
    const previous = hunks[index - 1]
    const current = hunks[index]
    const next = hunks[index + 1]
    const startLimit = previous
      ? previous.oldEnd + Math.floor((current.oldStart - previous.oldEnd) / 2)
      : 0
    const endLimit = next
      ? current.oldEnd + Math.floor((next.oldStart - current.oldEnd) / 2)
      : oldChars.length
    const update = createContentUpdate(oldChars, newChars, current, startLimit, endLimit, fullContent)
    if (update) {
      updates.push(update)
      continue
    }
    const mergeAt = index === 0 ? 0 : index - 1
    const merged = [...hunks]
    merged.splice(mergeAt, 2, mergeHunks(merged[mergeAt], merged[mergeAt + 1]))
    return materializeContentHunks(oldChars, newChars, merged, fullContent)
  }
  return updates
}

function createContentUpdate (oldChars, newChars, hunk, startLimit, endLimit, fullContent) {
  const maxContext = Math.max(hunk.oldStart - startLimit, endLimit - hunk.oldEnd)
  for (let context = 0; context <= maxContext; context++) {
    const left = Math.min(context, hunk.oldStart - startLimit, hunk.newStart)
    const right = Math.min(context, endLimit - hunk.oldEnd, newChars.length - hunk.newEnd)
    const oldStart = hunk.oldStart - left
    const oldEnd = hunk.oldEnd + right
    const newStart = hunk.newStart - left
    const newEnd = hunk.newEnd + right
    const oldStr = oldChars.slice(oldStart, oldEnd).join('')
    if (!oldStr) continue
    if (countOccurrences(fullContent, oldStr) !== 1) continue
    return { old_str: oldStr, new_str: newChars.slice(newStart, newEnd).join('') }
  }
  return null
}

function diffCharacterHunks (oldChars, newChars) {
  const frontier = new Map([[1, 0]])
  const trace = []
  const maxDistance = Math.min(oldChars.length + newChars.length, MAX_CHARACTER_DIFF_DISTANCE)
  for (let distance = 0; distance <= maxDistance; distance++) {
    trace.push(new Map(frontier))
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY
      const right = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY
      let oldIndex
      if (diagonal === -distance || (diagonal !== distance && right < down)) oldIndex = down
      else oldIndex = right + 1
      let newIndex = oldIndex - diagonal
      while (oldIndex < oldChars.length && newIndex < newChars.length && oldChars[oldIndex] === newChars[newIndex]) {
        oldIndex++
        newIndex++
      }
      frontier.set(diagonal, oldIndex)
      if (oldIndex >= oldChars.length && newIndex >= newChars.length) {
        return operationsToHunks(trace, oldChars.length, newChars.length)
      }
    }
  }
  return null
}

function operationsToHunks (trace, oldLength, newLength) {
  let oldIndex = oldLength
  let newIndex = newLength
  const operations = []
  for (let distance = trace.length - 1; distance >= 0; distance--) {
    const current = trace[distance]
    const diagonal = oldIndex - newIndex
    const down = current.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY
    const right = current.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY
    const previousDiagonal = diagonal === -distance || (diagonal !== distance && right < down) ? diagonal + 1 : diagonal - 1
    const previousOldIndex = distance === 0 ? 0 : current.get(previousDiagonal)
    const previousNewIndex = previousOldIndex - previousDiagonal
    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      operations.push({ type: 'equal' })
      oldIndex--
      newIndex--
    }
    if (distance === 0) break
    if (oldIndex === previousOldIndex) {
      operations.push({ type: 'insert' })
      newIndex--
    } else {
      operations.push({ type: 'delete' })
      oldIndex--
    }
  }
  operations.reverse()

  const hunks = []
  let oldPosition = 0
  let newPosition = 0
  let active = null
  for (const operation of operations) {
    if (operation.type === 'equal') {
      if (active) {
        active.oldEnd = oldPosition
        active.newEnd = newPosition
        hunks.push(active)
        active = null
      }
      oldPosition++
      newPosition++
      continue
    }
    if (!active) active = { oldStart: oldPosition, newStart: newPosition }
    if (operation.type === 'delete') oldPosition++
    else newPosition++
  }
  if (active) {
    active.oldEnd = oldPosition
    active.newEnd = newPosition
    hunks.push(active)
  }
  return hunks
}

function mergeCloseHunks (hunks, distance) {
  const merged = []
  for (const hunk of hunks) {
    const previous = merged[merged.length - 1]
    if (previous && hunk.oldStart - previous.oldEnd <= distance && hunk.newStart - previous.newEnd <= distance) {
      previous.oldEnd = hunk.oldEnd
      previous.newEnd = hunk.newEnd
    } else {
      merged.push({ ...hunk })
    }
  }
  return merged
}

function mergeHunks (left, right) {
  return {
    oldStart: Math.min(left.oldStart, right.oldStart),
    oldEnd: Math.max(left.oldEnd, right.oldEnd),
    newStart: Math.min(left.newStart, right.newStart),
    newEnd: Math.max(left.newEnd, right.newEnd)
  }
}

function countOccurrences (content, value) {
  let count = 0
  let index = 0
  while ((index = content.indexOf(value, index)) !== -1) {
    count++
    index++
  }
  return count
}

function findProperty (properties = {}, name) {
  const entry = Object.entries(properties).find(([key]) => key.toLowerCase() === name)
  if (entry) return entry[1]
  return name === 'title' ? Object.values(properties).find(property => property.type === 'title') : undefined
}

function propertyValue (property) {
  if (!property) return null
  const value = property[property.type]
  if (property.type === 'title' || property.type === 'rich_text') return (value || []).map(item => item.plain_text ?? item.text?.content ?? '').join('')
  if (property.type === 'select' || property.type === 'status') return value?.name || ''
  if (property.type === 'multi_select') return (value || []).map(option => option.name)
  if (property.type === 'date') return value?.start || ''
  if (property.type === 'created_time' || property.type === 'last_edited_time') return value || ''
  if (property.type === 'formula') return value?.[value.type] ?? null
  return null
}

// Notion renews signed attachment URLs when reading a page. A refreshed signature
// is not an article edit; reuse the fresh URL when saving unchanged attachments.
const FILE_URL_PATTERN = /https:\/\/[^\s"<>)]*\?[^\s"<>)]*/g

function fileUrlKey (value) {
  try {
    const url = new URL(value)
    if (!url.searchParams.has('X-Amz-Signature')) return null
    if (!(url.hostname.endsWith('.amazonaws.com') || url.hostname.endsWith('.notion-static.com'))) return null
    return url.origin + url.pathname
  } catch { return null }
}

function normalizeFileUrls (content) {
  return content.replace(FILE_URL_PATTERN, url => fileUrlKey(url) || url)
}

function refreshFileUrls (content, current) {
  const urls = new Map([...current.matchAll(FILE_URL_PATTERN)].map(match => [fileUrlKey(match[0]), match[0]]).filter(([key]) => key))
  return content.replace(FILE_URL_PATTERN, url => urls.get(fileUrlKey(url)) || url)
}

function asArray (value) { return Array.isArray(value) ? value : value ? [value] : [] }

function normalizeId (value) {
  const match = String(value || '').match(/(?:^|\/)([a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})(?:[?#]|$)/i)
  if (!match) return null
  const id = match[1].replace(/-/g, '').toLowerCase()
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-')
}

function requireId (value) {
  const id = normalizeId(value)
  if (!id) throw new NotionContentError('Notion 页面 ID 无效。', 400)
  return id
}

async function request (context, path, options = {}) {
  const method = options.method || 'GET'
  const isWrite = method === 'PATCH'
  let response
  try {
    response = await notionFetch(NOTION_API_BASE + path, {
      method,
      headers: { Authorization: 'Bearer ' + context.token, 'Notion-Version': options.notionVersion || API_VERSION, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(18000),
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    }, { maxRetries: isWrite ? 0 : 2 })
  } catch {
    throw new NotionContentError(
      '连接 Notion 超时或网络不可用，请稍后重试。',
      502,
      { writeStage: options.writeStage, writeUncertain: isWrite }
    )
  }
  if (!response.ok) {
    const notionCode = await readNotionErrorCode(response)
    const message = (response.status === 401 || response.status === 403
      ? 'Notion 拒绝访问，请确认集成令牌有效、具有读取/更新内容权限，并已连接博客数据库。'
      : response.status === 404 ? '无法访问 Notion 文章或数据库，请检查集成连接和配置的 ID。'
        : response.status === 400 ? 'Notion 未接受本次修改，请检查字段类型、状态选项或正文格式。'
          : response.status === 429 ? 'Notion 请求过于频繁，请稍后再试。' : 'Notion 服务暂时不可用，请稍后重试。') +
      (notionCode ? '（' + notionCode + '）' : '')
    throw new NotionContentError(message, [400, 404, 409].includes(response.status) ? response.status : 502, {
      httpStatus: response.status,
      notionCode,
      writeStage: options.writeStage,
      writeRejected: isWrite && response.status < 500,
      writeUncertain: isWrite && response.status >= 500
    })
  }
  return response.json()
}

async function readNotionErrorCode (response) {
  try {
    const data = await response.json()
    return typeof data?.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/i.test(data.code)
      ? data.code
      : undefined
  } catch {
    return undefined
  }
}
