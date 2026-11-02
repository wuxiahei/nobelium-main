import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GitHubContentError,
  createGitHubPost,
  getGitHubContentConfig,
  listGitHubPosts,
  parseFrontMatter,
  parseGitHubIssue
} from '../lib/server/github-posts.mjs'

const CONTENT_ENV_KEYS = [
  'CONTENT_GITHUB_REPO',
  'CONTENT_GITHUB_TOKEN',
  'CONTENT_GITHUB_LABEL',
  'CONTENT_GITHUB_DRAFT_LABEL',
  'CONTENT_GITHUB_TAG_PREFIX',
  'COMMENTS_GITHUB_REPO',
  'COMMENTS_GITHUB_TOKEN'
]
const originalEnv = snapshotEnv(CONTENT_ENV_KEYS)
const defaultConfig = {
  repo: 'owner/posts',
  token: '',
  label: 'nobelium-post',
  draftLabel: 'nobelium-draft',
  tagPrefix: 'tag:'
}

function applyEnv (values) {
  for (const key of CONTENT_ENV_KEYS) delete process.env[key]
  Object.assign(process.env, values)
}

function restoreEnv (keys, values) {
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
}

function snapshotEnv (keys) {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function makeIssue (overrides = {}) {
  return {
    number: 1,
    title: 'Hello Issue',
    body: 'First paragraph.\n\nSecond paragraph.',
    labels: ['nobelium-post'],
    created_at: '2026-11-02T08:00:00Z',
    html_url: 'https://github.com/owner/posts/issues/1',
    ...overrides
  }
}

function mockResponse (data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  }
}

test('parses front matter and derives GitHub issue metadata', () => {
  const parsed = parseFrontMatter(`---
slug: "Custom Post"
summary: 'Summary from front matter'
date: 2026-10-30
tags:
  - Next.js
  - "Vercel"
---

Article body.
`)

  assert.equal(parsed.data.slug, 'Custom Post')
  assert.equal(parsed.data.summary, 'Summary from front matter')
  assert.deepEqual(parsed.data.tags, ['Next.js', 'Vercel'])
  assert.equal(parsed.content, 'Article body.\n')

  const post = parseGitHubIssue(makeIssue({
    body: `---
slug: custom-post
tags:
  - Next.js
---

A readable first paragraph.
`,
    labels: ['nobelium-post', 'tag:Vercel']
  }), defaultConfig)

  assert.equal(post.slug, 'custom-post')
  assert.equal(post.summary, 'A readable first paragraph.')
  assert.deepEqual(post.tags, ['Next.js', 'Vercel'])
  assert.equal(post.draft, false)
  assert.equal(post.githubIssueNumber, 1)
})

test('hides drafts and pull requests from the public article list', () => {
  const draft = parseGitHubIssue(makeIssue({
    labels: ['nobelium-post', 'nobelium-draft']
  }), defaultConfig)
  const visibleDraft = parseGitHubIssue(makeIssue({
    labels: ['nobelium-post', 'nobelium-draft']
  }), defaultConfig, { includeDrafts: true })
  const pullRequest = parseGitHubIssue(makeIssue({ pull_request: {} }), defaultConfig)
  const ordinaryIssue = parseGitHubIssue(makeIssue({ labels: ['bug'] }), defaultConfig)

  assert.equal(draft, null)
  assert.equal(visibleDraft.draft, true)
  assert.equal(pullRequest, null)
  assert.equal(ordinaryIssue, null)
})

test('reads paginated public issues without falling back to the comments repository', async t => {
  t.after(() => {
    restoreEnv(CONTENT_ENV_KEYS, originalEnv)
    globalThis.fetch = originalFetch
  })
  const originalFetch = globalThis.fetch
  applyEnv({
    CONTENT_GITHUB_REPO: 'owner/posts',
    COMMENTS_GITHUB_REPO: 'owner/comments',
    COMMENTS_GITHUB_TOKEN: 'comment-token'
  })

  assert.equal(getGitHubContentConfig().repo, 'owner/posts')

  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    const page = new URL(String(url)).searchParams.get('page')
    if (page === '1') {
      const filler = Array.from({ length: 99 }, (_, index) => makeIssue({
        number: index + 10,
        title: 'Filler ' + index,
        labels: []
      }))
      return mockResponse([makeIssue(), ...filler])
    }
    return mockResponse([])
  }

  const posts = await listGitHubPosts()
  assert.equal(posts.length, 1)
  assert.equal(posts[0].slug, 'hello-issue-1')
  assert.equal(calls.length, 2)
  assert.match(calls[1], /page=2/)
  assert.equal(JSON.parse(JSON.stringify(calls)).some(call => call.includes('comments')), false)

  delete process.env.COMMENTS_GITHUB_REPO
  delete process.env.CONTENT_GITHUB_REPO
  assert.equal(getGitHubContentConfig(), null)
})

test('allows an empty Markdown body when creating a draft', async t => {
  t.after(() => {
    restoreEnv(CONTENT_ENV_KEYS, originalEnv)
    globalThis.fetch = originalFetch
  })
  const originalFetch = globalThis.fetch
  applyEnv({
    CONTENT_GITHUB_REPO: 'owner/posts',
    CONTENT_GITHUB_TOKEN: 'server-only-token'
  })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const parsedUrl = new URL(String(url))
    calls.push({ url: parsedUrl, options })
    if ((options.method || 'GET') === 'GET' && parsedUrl.pathname.includes('/labels/')) {
      return mockResponse({ name: parsedUrl.pathname.split('/').pop() })
    }
    if (options.method === 'POST' && parsedUrl.pathname.endsWith('/issues')) {
      const payload = JSON.parse(options.body)
      return mockResponse(makeIssue({
        number: 42,
        title: payload.title,
        body: payload.body,
        labels: payload.labels,
        html_url: 'https://github.com/owner/posts/issues/42'
      }), 201)
    }
    throw new Error('Unexpected request: ' + (options.method || 'GET') + ' ' + url)
  }

  const post = await createGitHubPost({
    title: 'Empty draft',
    content: '',
    draft: true,
    date: '2026-11-02'
  })

  assert.equal(post.draft, true)
  assert.equal(post.githubIssueNumber, 42)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-only-token')
  const issuePayload = JSON.parse(calls[2].options.body)
  assert.deepEqual(issuePayload.labels, ['nobelium-post', 'nobelium-draft'])
  assert.match(issuePayload.body, /^---\nslug:/)
})

test('rejects publishing an empty body before calling GitHub', async t => {
  t.after(() => {
    restoreEnv(CONTENT_ENV_KEYS, originalEnv)
    globalThis.fetch = originalFetch
  })
  const originalFetch = globalThis.fetch
  applyEnv({
    CONTENT_GITHUB_REPO: 'owner/posts',
    CONTENT_GITHUB_TOKEN: 'server-only-token'
  })
  globalThis.fetch = async () => {
    throw new Error('GitHub should not be called')
  }

  await assert.rejects(
    () => createGitHubPost({ title: 'Empty published post', content: '', draft: false }),
    error => error instanceof GitHubContentError && /必须有正文/.test(error.message)
  )
})
