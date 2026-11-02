import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_CONTENT_LENGTH,
  MAX_NICKNAME_LENGTH,
  addGuestComment,
  createCommentBody,
  issueTitleForPage,
  listGuestComments,
  parseCommentBody,
  validateCommentInput,
  validatePageId
} from '../lib/server/github-comments.mjs'

test('validates page IDs and guest comment input', () => {
  assert.equal(validatePageId(' 1234abcd-ef56_7890 '), '1234abcd-ef56_7890')
  assert.throws(() => validatePageId(''), /页面标识无效/)
  assert.throws(() => validatePageId('../post'), /页面标识无效/)

  assert.deepEqual(
    validateCommentInput({
      pageId: 'post-id',
      pageTitle: '  A post  ',
      nickname: '  小明  ',
      content: ' 第一行\r\n第二行 ',
      website: ''
    }),
    {
      pageId: 'post-id',
      pageTitle: 'A post',
      nickname: '小明',
      content: '第一行\n第二行'
    }
  )

  assert.throws(
    () => validateCommentInput({ pageId: 'post-id', nickname: 'bot', content: 'spam', website: 'https://spam.test' }),
    /防垃圾/
  )
  assert.throws(
    () => validateCommentInput({ pageId: 'post-id', nickname: '', content: 'hello' }),
    /昵称/
  )
  assert.throws(
    () => validateCommentInput({ pageId: 'post-id', nickname: 'reader', content: '' }),
    /留言内容/
  )
  assert.throws(
    () => validateCommentInput({ pageId: 'post-id', nickname: 'x'.repeat(MAX_NICKNAME_LENGTH + 1), content: 'hello' }),
    /昵称不能超过/
  )
  assert.throws(
    () => validateCommentInput({ pageId: 'post-id', nickname: 'reader', content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) }),
    /留言不能超过/
  )
})

test('creates stable issue titles and encodes comments safely', () => {
  const pageId = '1234abcd-ef56-7890'
  const firstTitle = issueTitleForPage(pageId)
  assert.match(firstTitle, /^\[Blog comments\] [a-f0-9]{16}$/)
  assert.equal(firstTitle, issueTitleForPage(pageId))
  assert.notEqual(firstTitle, issueTitleForPage('another-page'))

  const body = createCommentBody({
    nickname: 'Alice',
    content: 'Hello @octocat\n**not bold** and <script>alert(1)</script>'
  })
  const parsed = parseCommentBody(body)

  assert.deepEqual(parsed, {
    nickname: 'Alice',
    content: 'Hello @octocat\n**not bold** and <script>alert(1)</script>'
  })
  assert.match(body, /@\u200Boctocat/)
  assert.doesNotMatch(body, /\n@octocat/)
  assert.match(body, /\\\*\\\*not bold\\\*\\\*/)
  assert.equal(parseCommentBody('ordinary GitHub issue comment'), null)
  assert.equal(parseCommentBody('<!-- nobelium-guest-comment:not-json -->\nhello'), null)
})

test('creates an issue and comment through the GitHub API with server credentials', async t => {
  const previousRepo = process.env.COMMENTS_GITHUB_REPO
  const previousToken = process.env.COMMENTS_GITHUB_TOKEN
  const previousFetch = globalThis.fetch
  const calls = []

  process.env.COMMENTS_GITHUB_REPO = 'owner/comments'
  process.env.COMMENTS_GITHUB_TOKEN = 'server-only-token'

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    const method = options.method || 'GET'
    const parsedUrl = new URL(String(url))

    if (method === 'GET' && parsedUrl.pathname.endsWith('/issues')) {
      return mockResponse([])
    }

    if (method === 'POST' && parsedUrl.pathname.endsWith('/issues')) {
      return mockResponse({ number: 7, title: issueTitleForPage('page-1') }, 201)
    }

    if (method === 'POST' && parsedUrl.pathname.endsWith('/issues/7/comments')) {
      return mockResponse({
        id: 99,
        created_at: '2026-11-02T10:00:00Z'
      }, 201)
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }

  t.after(() => {
    restoreEnv('COMMENTS_GITHUB_REPO', previousRepo)
    restoreEnv('COMMENTS_GITHUB_TOKEN', previousToken)
    globalThis.fetch = previousFetch
  })

  const created = await addGuestComment({
    pageId: 'page-1',
    pageTitle: 'Page One',
    pageUrl: 'https://example.com/page-1',
    nickname: 'Alice',
    content: 'Hello'
  })

  assert.deepEqual(created, {
    id: '99',
    nickname: 'Alice',
    content: 'Hello',
    createdAt: '2026-11-02T10:00:00Z'
  })
  assert.equal(calls.length, 3)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-only-token')
  assert.match(JSON.parse(calls[1].options.body).body, /Page ID/)
  assert.ok(parseCommentBody(JSON.parse(calls[2].options.body).body))
})

test('lists only guest comments that contain the hidden marker', async t => {
  const previousRepo = process.env.COMMENTS_GITHUB_REPO
  const previousToken = process.env.COMMENTS_GITHUB_TOKEN
  const previousFetch = globalThis.fetch
  const pageId = 'page-2'
  const title = issueTitleForPage(pageId)

  process.env.COMMENTS_GITHUB_REPO = 'owner/comments'
  process.env.COMMENTS_GITHUB_TOKEN = 'server-only-token'

  globalThis.fetch = async (url, options) => {
    const parsedUrl = new URL(String(url))
    if (parsedUrl.pathname.endsWith('/issues')) {
      return mockResponse([{ number: 8, title }])
    }
    if (parsedUrl.pathname.endsWith('/issues/8/comments')) {
      return mockResponse([
        {
          id: 1,
          body: createCommentBody({ nickname: 'Alice', content: 'First' }),
          created_at: '2026-11-02T10:00:00Z'
        },
        {
          id: 2,
          body: 'A maintainer note that is not a guest comment.',
          created_at: '2026-11-02T11:00:00Z'
        }
      ])
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`)
  }

  t.after(() => {
    restoreEnv('COMMENTS_GITHUB_REPO', previousRepo)
    restoreEnv('COMMENTS_GITHUB_TOKEN', previousToken)
    globalThis.fetch = previousFetch
  })

  const comments = await listGuestComments(pageId)
  assert.deepEqual(comments, [{
    id: '1',
    nickname: 'Alice',
    content: 'First',
    createdAt: '2026-11-02T10:00:00Z'
  }])
})

function mockResponse (data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  }
}

function restoreEnv (key, value) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}