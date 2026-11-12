import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdminNotionPost, listAdminNotionPosts, updateNotionPost, isNotionWriteConfigured } from '../lib/server/notion-posts.mjs'

const SOURCE = '11111111-1111-1111-1111-111111111111'
const DATABASE = '22222222-2222-2222-2222-222222222222'
const PAGE = '33333333-3333-3333-3333-333333333333'
const OTHER = '44444444-4444-4444-4444-444444444444'
const envKeys = ['NOTION_API_KEY', 'NOTION_TOKEN', 'NOTION_INTEGRATION_TOKEN', 'NOTION_API_TOKEN', 'NOTION_AUTH_TOKEN', 'NOTION_SECRET', 'NOTION_DATABASE_ID', 'NOTION_DATA_SOURCE_ID', 'NOTION_REQUEST_INTERVAL_MS', 'CONTENT_GITHUB_REPO', 'CONTENT_GITHUB_TOKEN']
const text = (id, type, value) => ({ id, type, [type]: [{ type: 'text', text: { content: value }, plain_text: value }] })

function fixture (t) {
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  envKeys.forEach(key => delete process.env[key])
  Object.assign(process.env, { NOTION_API_KEY: 'test-token', NOTION_DATA_SOURCE_ID: SOURCE, NOTION_REQUEST_INTERVAL_MS: '0' })
  const state = {
    page: {
      id: PAGE, parent: { type: 'data_source_id', data_source_id: SOURCE },
      created_time: '2026-01-01T00:00:00.000Z', last_edited_time: '2026-11-01T00:00:00.000Z',
      properties: {
        title: text('title', 'title', 'Notion article'), slug: text('slug', 'rich_text', 'notion-article'),
        summary: text('summary', 'rich_text', 'A summary'),
        date: { id: 'date', type: 'date', date: { start: '2026-01-01' } },
        tags: { id: 'tags', type: 'multi_select', multi_select: [{ name: 'Notion' }] },
        type: { id: 'type', type: 'select', select: { name: 'Post' } },
        status: { id: 'status', type: 'status', status: { name: 'Published' } }
      }
    },
    schema: {
      parent: { type: 'database_id', database_id: DATABASE },
      properties: {
        title: { id: 'title', type: 'title' }, slug: { id: 'slug', type: 'rich_text' },
        summary: { id: 'summary', type: 'rich_text' }, date: { id: 'date', type: 'date' },
        tags: { id: 'tags', type: 'multi_select' },
        status: { id: 'status', type: 'status', status: { options: [{ name: 'Draft' }, { name: 'Published' }] } }
      }
    },
    markdown: { markdown: '## Hello\n\nOriginal content.', truncated: false, unknown_block_ids: [] },
    calls: [], writes: [], revision: 0,
    failProperties: false, failBody: false, networkFailure: false, denied: false, warning: false, changeDuringRead: false,
    bump () { this.revision++; this.page.last_edited_time = new Date(Date.UTC(2026, 10, 1, 0, 0, this.revision)).toISOString() }
  }
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/v1', '')
    const body = init.body ? JSON.parse(init.body) : null
    const method = init.method || 'GET'
    state.calls.push({ path, method, body })
    if (state.networkFailure && method === 'PATCH') throw new TypeError('private network details')
    const legacyDatabaseRequest = path === '/databases/' + DATABASE || path === '/databases/' + DATABASE + '/query'
    assert.equal(init.headers['Notion-Version'], legacyDatabaseRequest ? '2022-06-28' : '2026-03-11')
    assert.equal(init.headers.Authorization, 'Bearer test-token')
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (state.denied) return response({ message: 'private upstream information' }, 403)
    if (path === '/data_sources/' + SOURCE && method === 'GET') return response(state.schema)
    if (path === '/databases/' + DATABASE) return response(state.databaseResponse || { data_sources: [{ id: SOURCE }] })
    if (path === '/databases/' + DATABASE + '/query') return response({ results: [state.page], has_more: false })
    if (path === '/data_sources/' + SOURCE + '/query') return response({ results: [state.page], has_more: false })
    if (path === '/pages/' + PAGE && method === 'GET') return response(state.page)
    if (path === '/pages/' + PAGE + '/markdown' && method === 'GET') {
      if (state.changeDuringRead) state.bump()
      return response(state.markdown)
    }
    if (method === 'PATCH') {
      state.writes.push({ path, body })
      if (path.endsWith('/markdown')) {
        if (state.failBody) return response({ code: 'validation_error', message: 'private upstream information' }, 400)
        const command = body.update_content || body.replace_content
        assert.equal(command.allow_deleting_content, false)
        assert.equal(body.markdown_version, 'v2')
        if (body.type === 'update_content') {
          assert.equal(command.content_updates[0].old_str, state.markdown.markdown)
          state.markdown.markdown = command.content_updates[0].new_str
        } else {
          assert.equal(body.type, 'replace_content')
          state.markdown.markdown = command.new_str
        }
        state.bump()
        return response({ ...state.markdown, ...(state.warning ? { warnings: [{ code: 'normalization' }] } : {}) })
      }
      if (state.failProperties) return response({ code: 'validation_error', message: 'private upstream information' }, 400)
      for (const [id, next] of Object.entries(body.properties)) {
        const field = Object.keys(state.page.properties).find(key => state.page.properties[key].id === id)
        state.page.properties[field] = { ...state.page.properties[field], ...next }
      }
      state.bump()
      return response(state.page)
    }
    throw new Error('Unexpected request: ' + method + ' ' + path)
  }
  t.after(() => {
    globalThis.fetch = originalFetch
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })
  return state
}

const payload = (doc, overrides = {}) => ({
  title: doc.post.title, slug: doc.post.slug, summary: doc.post.summary,
  date: doc.post.date.slice(0, 10), tags: doc.post.tags, draft: doc.post.draft,
  content: doc.content, expectedRevision: doc.post.revision, ...overrides
})

test('lists published and draft Notion articles through the configured database without GitHub', async t => {
  const state = fixture(t)
  delete process.env.NOTION_DATA_SOURCE_ID
  process.env.NOTION_DATABASE_ID = DATABASE
  assert.equal(isNotionWriteConfigured(), true)
  state.databaseResponse = { properties: state.schema.properties }
  const posts = await listAdminNotionPosts()
  assert.equal(posts[0].source, 'notion')
  assert.equal(posts[0].notionPageId, PAGE)
  assert.equal((await getAdminNotionPost(PAGE)).post.id, PAGE)
  state.page.properties.status.status.name = 'Draft'
  assert.equal((await listAdminNotionPosts())[0].draft, true)
  state.page.properties.type.select.name = 'Task'
  assert.deepEqual(await listAdminNotionPosts(), [])
  state.page.properties.type.select.name = 'Post'
  state.schema.parent.database_id = OTHER
  await assert.rejects(getAdminNotionPost(PAGE), error => error.status === 404)
})

test('writes body and metadata to the original Notion page and keeps published status', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  const result = await updateNotionPost(PAGE, payload(doc, { title: 'Updated title', content: '## Updated\n\nContent.' }))
  assert.equal(result.post.title, 'Updated title')
  assert.equal(result.post.draft, false)
  assert.equal(result.content, '## Updated\n\nContent.')
  assert.equal(result.previousSlug, 'notion-article')
  assert.notEqual(result.post.revision, doc.post.revision)
  assert.equal(state.writes.length, 2)
  assert.deepEqual(Object.keys(state.writes[1].body.properties), ['title'])
})

test('refuses stale or missing revisions before making any writes', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  state.page.properties.summary = text('summary', 'rich_text', 'Externally edited')
  await assert.rejects(updateNotionPost(PAGE, payload(doc)), error => error.status === 409)
  await assert.rejects(updateNotionPost(PAGE, { title: 'No revision' }), error => error.status === 409)
  assert.equal(state.writes.length, 0)
})

test('refuses access outside the configured data source before reading or writing its body', async t => {
  const state = fixture(t)
  state.page.parent.data_source_id = OTHER
  await assert.rejects(getAdminNotionPost(PAGE), error => error.status === 404)
  assert.equal(state.calls.some(call => call.path.endsWith('/markdown')), false)
  assert.equal(state.writes.length, 0)
})

test('rejects archived pages and non-article rows', async t => {
  const state = fixture(t)
  state.page.archived = true
  await assert.rejects(getAdminNotionPost(PAGE), error => error.status === 404)
  state.page.archived = false
  state.page.properties.type.select.name = 'Task'
  await assert.rejects(getAdminNotionPost(PAGE), error => error.status === 404)
})

test('protects unknown, truncated and synced content while still saving metadata', async t => {
  const state = fixture(t)
  state.markdown = { markdown: '<synced-block url="https://notion.so/test">Shared</synced-block>', truncated: false }
  let doc = await getAdminNotionPost(PAGE)
  assert.equal(doc.post.contentEditable, false)
  await assert.rejects(updateNotionPost(PAGE, payload(doc, { content: 'replace' })), error => error.status === 400)
  await updateNotionPost(PAGE, payload(doc, { title: 'Metadata only', content: undefined }))
  assert.equal(state.writes.length, 1)
  assert.ok(!state.writes[0].path.endsWith('/markdown'))
  state.markdown = { markdown: 'Partial content', truncated: true, unknown_block_ids: [OTHER] }
  doc = await getAdminNotionPost(PAGE)
  assert.equal(doc.post.contentEditable, false)
  state.markdown = { markdown: '<unknown url="https://notion.so/test">Unsupported</unknown>', truncated: false, unknown_block_ids: [] }
  doc = await getAdminNotionPost(PAGE)
  assert.equal(doc.post.contentEditable, false)
})

test('allows editing around protected Notion link previews without changing their markers', async t => {
  const state = fixture(t)
  const preview = '<link-preview url="https://example.com/article" />'
  state.markdown = { markdown: 'Before\n\n' + preview + '\n\nAfter', truncated: false, unknown_block_ids: [] }
  const doc = await getAdminNotionPost(PAGE)
  assert.equal(doc.post.contentEditable, true)
  const result = await updateNotionPost(PAGE, payload(doc, { content: doc.content + '\n\nNew paragraph.' }))
  assert.equal(result.content, doc.content + '\n\nNew paragraph.')
  assert.equal(state.writes.length, 1)
  assert.ok(state.writes[0].body.update_content.content_updates[0].new_str.includes(preview))
  await assert.rejects(updateNotionPost(PAGE, payload(result, { content: result.content.replace(preview, '') })), error => error.status === 400)
  await assert.rejects(updateNotionPost(PAGE, payload(result, { content: result.content.replace('https://example.com/article', 'https://example.com/changed') })), error => error.status === 400)
  await assert.rejects(updateNotionPost(PAGE, payload(result, { content: result.content + '\n\n<link-preview url="https://example.com/new" />' })), error => error.status === 400)
  assert.equal(state.writes.length, 1)
})

test('metadata-only changes never rewrite the article body', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  await updateNotionPost(PAGE, payload(doc, { summary: 'New summary', draft: true }))
  assert.equal(state.writes.length, 1)
  assert.ok(!state.writes[0].path.endsWith('/markdown'))
  assert.equal(state.page.properties.status.status.name, 'Draft')
})

test('validates field types before sending a body write', async t => {
  const state = fixture(t)
  state.schema.properties.summary = { id: 'summary', type: 'formula' }
  const doc = await getAdminNotionPost(PAGE)
  assert.equal(doc.post.editableFields.summary, false)
  await assert.rejects(updateNotionPost(PAGE, payload(doc, { summary: 'Cannot write formula', content: 'New body' })), error => error.status === 400)
  assert.equal(state.writes.length, 0)
})

test('reports a rejected body as unsaved without claiming a partial write', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  state.failBody = true
  await assert.rejects(updateNotionPost(PAGE, payload(doc, { title: 'New title', content: 'Rejected body' })), error => {
    assert.equal(error.status, 400)
    assert.equal(error.notionCode, 'validation_error')
    assert.equal(error.writeStage, 'body')
    assert.match(error.message, /正文未保存/)
    assert.match(error.message, /validation_error/)
    assert.doesNotMatch(error.message, /部分修改可能已写入/)
    assert.doesNotMatch(error.message, /private upstream information/)
    return true
  })
  assert.equal(state.writes.length, 1)
  assert.equal(state.markdown.markdown, doc.content)
})

test('reports saved body when the following property write is rejected', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  state.failProperties = true
  await assert.rejects(updateNotionPost(PAGE, payload(doc, { title: 'New title', content: 'Saved body' })), error => {
    assert.equal(error.status, 409)
    assert.equal(error.notionCode, 'validation_error')
    assert.equal(error.writeStage, 'properties')
    assert.match(error.message, /正文已保存/)
    assert.match(error.message, /文章属性未保存/)
    assert.equal(error.changedPosts[0].slug, doc.post.slug)
    return true
  })
  assert.equal(state.writes.length, 2)
  assert.equal(state.markdown.markdown, 'Saved body')
  assert.equal(state.page.properties.title.title[0].plain_text, 'Notion article')
})

test('does not retry a network-failed write and marks the result as unconfirmed', async t => {
  const state = fixture(t)
  const doc = await getAdminNotionPost(PAGE)
  state.networkFailure = true
  await assert.rejects(updateNotionPost(PAGE, payload(doc, { content: 'Possibly saved body' })), error => {
    assert.equal(error.status, 409)
    assert.equal(error.writeStage, 'body')
    assert.equal(error.writeUncertain, true)
    assert.match(error.message, /保存结果未确认/)
    assert.doesNotMatch(error.message, /private network details/)
    assert.equal(error.changedPosts[0].slug, doc.post.slug)
    return true
  })
  assert.equal(state.writes.length, 0)
  assert.equal(state.calls.filter(call => call.method === 'PATCH').length, 1)
})

test('refreshed Notion attachment signatures do not cause a false conflict or body rewrite', async t => {
  const state = fixture(t)
  const file = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/path/image.png?X-Amz-Signature='
  state.markdown.markdown = '![Image](' + file + 'old)'
  const doc = await getAdminNotionPost(PAGE)
  state.markdown.markdown = '![Image](' + file + 'new)'
  await updateNotionPost(PAGE, payload(doc, { summary: 'New summary' }))
  assert.equal(state.writes.length, 1)
  assert.ok(!state.writes[0].path.endsWith('/markdown'))
  const fresh = await getAdminNotionPost(PAGE)
  await updateNotionPost(PAGE, payload(fresh, { content: doc.content + '\n\nNew paragraph' }))
  assert.ok(state.writes[1].body.update_content.content_updates[0].new_str.includes('Signature=new'))
})

test('supports filling an empty draft and reports parser warnings', async t => {
  const state = fixture(t)
  state.markdown.markdown = ''
  state.page.properties.status.status.name = 'Draft'
  state.warning = true
  const doc = await getAdminNotionPost(PAGE)
  const result = await updateNotionPost(PAGE, payload(doc, { content: 'New draft content' }))
  assert.equal(state.writes[0].body.type, 'replace_content')
  assert.equal(result.warnings.length, 1)
})

test('fails clearly for missing capabilities without exposing upstream details', async t => {
  const state = fixture(t)
  state.denied = true
  await assert.rejects(getAdminNotionPost(PAGE), error => error.message.includes('权限') && !error.message.includes('private upstream'))
})

test('rejects a page that changes while the editor is loading it', async t => {
  const state = fixture(t)
  state.changeDuringRead = true
  await assert.rejects(getAdminNotionPost(PAGE), error => error.status === 409)
  assert.equal(state.writes.length, 0)
})
