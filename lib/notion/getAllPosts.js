import { config as BLOG } from '@/lib/server/config'

import { getBlockCollectionId, parsePageId } from 'notion-utils'
import dayjs from 'dayjs'
import api from '@/lib/server/notion-api'
import { notionFetch } from '@/lib/server/notion-fetch.mjs'
import getAllPageIds from './getAllPageIds'
import getPageProperties from './getPageProperties'
import filterPublishedPosts from './filterPublishedPosts'
import { describeNotionEnv, getNotionToken } from './env'
import { normalizePostMetadata } from './normalizePostMetadata.mjs'
import { listGitHubPosts } from '@/lib/server/github-posts.mjs'
import { getPostSearchText } from './getPostSearchText'
import { sortPosts } from '@/lib/post-order.mjs'

const postsCache = new Map()

/**
 * @param {{ includePages?: boolean, includeSearchText?: boolean }} options
 */
export async function getAllPosts ({ includePages = false, includeSearchText = false } = {}) {
  if (shouldUseBuildCache()) {
    const cacheKey = [includePages ? 'with-pages' : 'posts-only', includeSearchText ? 'search' : 'metadata'].join(':')

    if (!postsCache.has(cacheKey)) {
      postsCache.set(
        cacheKey,
        loadAllPosts({ includePages, includeSearchText }).catch(error => {
          postsCache.delete(cacheKey)
          throw error
        })
      )
    }

    const posts = await postsCache.get(cacheKey)
    return posts.map(post => ({ ...post }))
  }

  return loadAllPosts({ includePages, includeSearchText })
}

async function loadAllPosts ({ includePages, includeSearchText }) {
  const [notionPosts, githubPosts] = await Promise.all([
    loadNotionPosts({ includePages, includeSearchText }).catch(error => {
      console.warn('[content] Notion posts could not be loaded.')
      console.warn(error?.message || error)
      return []
    }),
    listGitHubPosts({ includeSearchText }).catch(error => {
      console.warn('[content] GitHub posts could not be loaded; continuing with Notion only.')
      console.warn(error?.message || error)
      return []
    })
  ])

  const seenSlugs = new Set()
  const posts = []

  // Keep GitHub precedence for duplicate slugs, then sort both sources together.
  for (const post of [...githubPosts, ...notionPosts]) {
    if (!post) continue
    const slug = String(post.slug || '').trim()
    const key = slug || String(post.id || '')
    if (key && seenSlugs.has(key)) continue
    if (key) seenSlugs.add(key)
    posts.push(post)
  }

  return sortPosts(posts, BLOG.sortBy)
}

async function loadNotionPosts ({ includePages, includeSearchText }) {
  const officialPosts = await getAllPostsFromOfficialApi()
  if (officialPosts) {
    const posts = filterPublishedPosts({
      posts: officialPosts.map(normalizePostMetadata),
      includePages
    })
    return includeSearchText ? attachNotionSearchText(posts) : posts
  }

  const notionPageId = BLOG.notionPageId || process.env.NOTION_PAGE_ID
  const id = normalizeNotionId(notionPageId)

  if (!id) {
    console.warn(
      '[notion] NOTION_PAGE_ID is missing or invalid. Skipping static post generation.'
    )
    return []
  }

  let response
  try {
    response = await api.getPage(id)
  } catch (error) {
    console.warn(
      `[notion] Failed to load Notion page "${id}". Check NOTION_PAGE_ID, sharing permissions, and NOTION_ACCESS_TOKEN.`
    )
    console.warn(error?.message || error)
    return []
  }

  const block = response.block
  const rawMetadata = block?.[id]?.value

  const database = getDatabaseContext(response, id)

  if (!database) {
    warnMissingDatabase({ id, block, rawMetadata })
    return []
  }

  if (database.blockId !== id && rawMetadata?.type === 'page') {
    console.warn(
      `pageId "${id}" is a page. Using child database "${database.blockId}".`
    )
  }

  const { collectionQuery, schema } = database

  if (!collectionQuery || !block || !schema) {
    console.warn(
      `pageId "${database.blockId}" does not contain a readable database schema`
    )
    return []
  }

  // Construct Data
  const pageIds = getAllPageIds(collectionQuery)
  const data = []
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]
    const properties = (await getPageProperties(id, block, schema)) || null
    if (!properties) continue

    // Add fullwidth to properties
    properties.fullWidth = block[id]?.value?.format?.page_full_width ?? false
    // Convert date (with timezone) to unix milliseconds timestamp
    properties.date = (
      properties.date?.start_date
        ? dayjs.tz(properties.date?.start_date)
        : dayjs(block[id]?.value?.created_time)
    ).valueOf()
    properties.updatedAt = normalizeTimestamp(block[id]?.value?.last_edited_time)

    data.push(normalizePostMetadata(properties))
  }

  // remove all the the items doesn't meet requirements
  const posts = filterPublishedPosts({ posts: data, includePages })

  return includeSearchText ? attachNotionSearchText(posts) : posts
}

async function attachNotionSearchText (posts) {
  const enriched = []

  for (let index = 0; index < posts.length; index += 4) {
    const batch = posts.slice(index, index + 4)
    const results = await Promise.all(batch.map(async post => {
      try {
        const searchText = await getPostSearchText(post.id)
        return { ...post, searchText }
      } catch (error) {
        console.warn('[search] Could not index Notion post "' + (post.slug || post.id) + '".')
        console.warn(error?.message || error)
        return { ...post, searchText: '' }
      }
    }))
    enriched.push(...results)
  }

  return enriched
}

function shouldUseBuildCache () {
  return (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  )
}

function getDatabaseContext (recordMap, rootId) {
  const blockMap = recordMap.block || {}
  const rootBlock = blockMap[rootId]?.value
  const candidates = []

  if (isDatabaseBlock(rootBlock)) {
    candidates.push(rootBlock)
  }

  for (const childId of rootBlock?.content || []) {
    const childBlock = blockMap[childId]?.value
    if (isDatabaseBlock(childBlock)) {
      candidates.push(childBlock)
    }
  }

  for (const block of Object.values(blockMap)) {
    if (isDatabaseBlock(block?.value)) {
      candidates.push(block.value)
    }
  }

  for (const block of candidates) {
    const collectionId = getBlockCollectionId(block, recordMap)
    const collection = recordMap.collection?.[collectionId]?.value
    const collectionQuery = collectionId
      ? { [collectionId]: recordMap.collection_query?.[collectionId] }
      : recordMap.collection_query

    if (collection?.schema && Object.values(collectionQuery || {})[0]) {
      return {
        blockId: block.id,
        collection,
        collectionQuery,
        schema: collection.schema
      }
    }
  }

  return null
}

function isDatabaseBlock (block) {
  return (
    block?.type === 'collection_view_page' ||
    block?.type === 'collection_view'
  )
}

function warnMissingDatabase ({ id, block, rawMetadata }) {
  const foundTypes = Array.from(
    new Set(
      Object.values(block || {})
        .map(entry => entry?.value?.type)
        .filter(Boolean)
    )
  )

  console.warn(
    `[notion] NOTION_PAGE_ID "${id}" resolved to block type "${rawMetadata?.type || 'unknown'}", but no Notion database block was found.`
  )
  console.warn(
    `[notion] Found block types: ${foundTypes.length ? foundTypes.join(', ') : 'none'}.`
  )
  console.warn(
    '[notion] Use a full-page/inline database as NOTION_PAGE_ID, or configure NOTION_API_KEY with NOTION_DATA_SOURCE_ID / NOTION_DATABASE_ID.'
  )
}

async function getAllPostsFromOfficialApi () {
  const token = getNotionToken()
  const rawDataSourceId = process.env.NOTION_DATA_SOURCE_ID
  const rawDatabaseId = process.env.NOTION_DATABASE_ID

  if (!token && (rawDataSourceId || rawDatabaseId)) {
    console.warn(
      `[notion] NOTION_DATA_SOURCE_ID / NOTION_DATABASE_ID is set, but no Notion token was found. Env check: ${describeNotionEnv()}.`
    )
    return null
  }

  if (!token) return null

  const dataSourceId = normalizeNotionId(rawDataSourceId)
  const databaseId = normalizeNotionId(rawDatabaseId)

  if (!dataSourceId && !databaseId) return null

  const notionVersion =
    process.env.NOTION_VERSION || (dataSourceId ? '2025-09-03' : '2022-06-28')
  const endpoint = dataSourceId
    ? `https://api.notion.com/v1/data_sources/${dataSourceId}/query`
    : `https://api.notion.com/v1/databases/${databaseId}/query`

  try {
    const pages = []
    let cursor

    do {
      const response = await notionFetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': notionVersion
        },
        body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
      })

      if (!response.ok) {
        const message = await response.text()
        console.warn(
          `[notion] Official API query failed: ${response.status} ${message}`
        )
        return null
      }

      const data = await response.json()
      pages.push(...(data.results || []))
      cursor = data.has_more ? data.next_cursor : null
    } while (cursor)

    console.warn(
      `[notion] Loaded ${pages.length} pages from the official Notion API.`
    )

    return pages.map(mapOfficialPageToPost)
  } catch (error) {
    console.warn('[notion] Official API query failed.')
    console.warn(error?.message || error)
    return null
  }
}

function mapOfficialPageToPost (page) {
  const properties = page.properties || {}

  return {
    id: page.id,
    title: getOfficialProperty(properties, 'title'),
    slug: getOfficialProperty(properties, 'slug'),
    date: getOfficialProperty(properties, 'date') || page.created_time,
    summary: getOfficialProperty(properties, 'summary'),
    status: toArray(getOfficialProperty(properties, 'status')),
    type: toArray(getOfficialProperty(properties, 'type')),
    tags: toArray(getOfficialProperty(properties, 'tags')),
    category: toArray(getOfficialProperty(properties, 'category')),
    password: getOfficialProperty(properties, 'password'),
    fullWidth: false,
    updatedAt: normalizeTimestamp(page.last_edited_time)
  }
}

function getOfficialProperty (properties, name) {
  const property = findOfficialProperty(properties, name)
  if (!property) return null

  switch (property.type) {
    case 'title':
      return getRichText(property.title)
    case 'rich_text':
      return getRichText(property.rich_text)
    case 'select':
      return property.select?.name || null
    case 'multi_select':
      return property.multi_select?.map(option => option.name) || []
    case 'status':
      return property.status?.name || null
    case 'date':
      return property.date?.start ? dayjs.tz(property.date.start).valueOf() : null
    case 'checkbox':
      return property.checkbox
    case 'url':
      return property.url
    case 'email':
      return property.email
    case 'phone_number':
      return property.phone_number
    case 'number':
      return property.number
    case 'created_time':
      return dayjs(property.created_time).valueOf()
    case 'last_edited_time':
      return dayjs(property.last_edited_time).valueOf()
    default:
      return null
  }
}

function findOfficialProperty (properties, name) {
  const normalizedName = name.toLowerCase()
  const key = Object.keys(properties).find(
    key => key.toLowerCase() === normalizedName
  )

  return key ? properties[key] : null
}

function getRichText (richText = []) {
  return richText.map(text => text.plain_text || '').join('')
}

function toArray (value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeTimestamp (value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function normalizeNotionId (value) {
  return parsePageId(value, { uuid: true })
}
