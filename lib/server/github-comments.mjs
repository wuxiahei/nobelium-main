import { createHash } from 'node:crypto'

const COMMENT_MARKER_PREFIX = '<!-- nobelium-guest-comment:'
const COMMENT_MARKER_SUFFIX = ' -->'
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 15000
const MAX_ISSUE_PAGES = 10
const MAX_COMMENT_PAGES = 10

export const MAX_NICKNAME_LENGTH = 24
export const MAX_CONTENT_LENGTH = 2000
export const MAX_PAGE_TITLE_LENGTH = 160

export class CommentsConfigurationError extends Error {
  constructor (message) {
    super(message)
    this.name = 'CommentsConfigurationError'
  }
}

export class GitHubCommentsError extends Error {
  constructor (message, status = 502) {
    super(message)
    this.name = 'GitHubCommentsError'
    this.status = status
  }
}

export function getGitHubCommentsConfig () {
  const repo = (process.env.COMMENTS_GITHUB_REPO || '').trim()
  const token = (process.env.COMMENTS_GITHUB_TOKEN || '').trim()

  if (!repo || !token) {
    throw new CommentsConfigurationError('Guest comments are not configured.')
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new CommentsConfigurationError('COMMENTS_GITHUB_REPO must use the owner/repository format.')
  }

  return { repo, token }
}

export function validatePageId (value) {
  const pageId = String(value || '').trim()
  if (!pageId || pageId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(pageId)) {
    throw new Error('页面标识无效。')
  }
  return pageId
}

export function validateCommentInput (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('留言内容无效。')
  }

  if (String(input.website || '').trim()) {
    throw new Error('留言未通过防垃圾校验。')
  }

  const pageId = validatePageId(input.pageId)
  const pageTitle = normalizeSingleLine(input.pageTitle, MAX_PAGE_TITLE_LENGTH) || 'Untitled'
  const nickname = normalizeSingleLine(input.nickname, MAX_NICKNAME_LENGTH)
  const content = normalizeContent(input.content)

  if (!nickname) throw new Error('请填写昵称。')
  if (!content) throw new Error('请填写留言内容。')
  if (nickname.length > MAX_NICKNAME_LENGTH) throw new Error(`昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符。`)
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`留言不能超过 ${MAX_CONTENT_LENGTH} 个字符。`)

  return { pageId, pageTitle, nickname, content }
}

export function issueTitleForPage (pageId) {
  const id = validatePageId(pageId)
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 16)
  return `[Blog comments] ${digest}`
}

export function createIssueBody ({ pageId, pageTitle, pageUrl }) {
  const title = normalizeSingleLine(pageTitle, MAX_PAGE_TITLE_LENGTH) || 'Untitled'
  const url = normalizePageUrl(pageUrl)
  return [
    '<!-- nobelium-guest-comments-issue -->',
    'This issue stores public guest comments for one blog post.',
    '',
    `- Page ID: \`${validatePageId(pageId)}\``,
    `- Page title: ${escapeMarkdown(title)}`,
    `- Page URL: ${url ? escapeMarkdown(url) : 'Not provided'}`,
    '',
    'Delete one comment to remove it from the blog. Delete this issue to remove every comment for the post.'
  ].join('\n')
}

export function createCommentBody ({ nickname, content }) {
  const normalizedNickname = normalizeSingleLine(nickname, MAX_NICKNAME_LENGTH)
  const normalizedContent = normalizeContent(content)

  if (!normalizedNickname || !normalizedContent) {
    throw new Error('留言内容无效。')
  }
  if (normalizedNickname.length > MAX_NICKNAME_LENGTH) {
    throw new Error(`昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符。`)
  }
  if (normalizedContent.length > MAX_CONTENT_LENGTH) {
    throw new Error(`留言不能超过 ${MAX_CONTENT_LENGTH} 个字符。`)
  }

  const metadata = Buffer.from(JSON.stringify({
    v: 1,
    nickname: normalizedNickname,
    content: normalizedContent
  }), 'utf8').toString('base64url')

  return [
    `${COMMENT_MARKER_PREFIX}${metadata}${COMMENT_MARKER_SUFFIX}`,
    '',
    `**${escapeMarkdown(normalizedNickname)}**`,
    '',
    escapeMarkdown(normalizedContent)
  ].join('\n')
}

export function parseCommentBody (body) {
  if (typeof body !== 'string') return null

  if (!body.startsWith(COMMENT_MARKER_PREFIX)) return null
  const markerEnd = body.indexOf(COMMENT_MARKER_SUFFIX, COMMENT_MARKER_PREFIX.length)
  if (markerEnd < 0) return null

  const encoded = body.slice(COMMENT_MARKER_PREFIX.length, markerEnd)
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null

  try {
    const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (metadata?.v !== 1) return null

    const nickname = normalizeSingleLine(metadata.nickname, MAX_NICKNAME_LENGTH)
    const content = normalizeContent(metadata.content)
    if (!nickname || !content) return null
    if (nickname.length > MAX_NICKNAME_LENGTH || content.length > MAX_CONTENT_LENGTH) return null
    return { nickname, content }
  } catch {
    return null
  }
}

export async function listGuestComments (pageId) {
  const id = validatePageId(pageId)
  const issue = await findIssue(id)
  if (!issue) return []

  const comments = await listIssueComments(issue.number)
  return comments
    .map(comment => {
      const parsed = parseCommentBody(comment.body)
      if (!parsed) return null
      return {
        id: String(comment.id),
        nickname: parsed.nickname,
        content: parsed.content,
        createdAt: comment.created_at
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export async function addGuestComment (input) {
  const comment = validateCommentInput(input)
  let issue = await findIssue(comment.pageId)

  if (!issue) {
    issue = await githubRequest('/issues', {
      method: 'POST',
      body: {
        title: issueTitleForPage(comment.pageId),
        body: createIssueBody({
          pageId: comment.pageId,
          pageTitle: comment.pageTitle,
          pageUrl: input.pageUrl
        })
      }
    })
  }

  const created = await githubRequest(`/issues/${issue.number}/comments`, {
    method: 'POST',
    body: {
      body: createCommentBody(comment)
    }
  })

  return {
    id: String(created.id),
    nickname: comment.nickname,
    content: comment.content,
    createdAt: created.created_at
  }
}

async function findIssue (pageId) {
  const title = issueTitleForPage(pageId)

  for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
    const issues = await githubRequest(
      `/issues?state=all&per_page=100&page=${page}&sort=created&direction=asc`
    )
    const found = issues.find(issue => !issue.pull_request && issue.title === title)
    if (found) return found
    if (issues.length < 100) return null
  }

  return null
}

async function listIssueComments (issueNumber) {
  const number = validateIssueNumber(issueNumber)
  const comments = []

  for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
    const batch = await githubRequest(
      `/issues/${number}/comments?per_page=100&page=${page}`
    )
    comments.push(...batch)
    if (batch.length < 100) break
  }

  return comments
}

async function githubRequest (path, options = {}) {
  const { repo, token } = getGitHubCommentsConfig()
  const repoPath = repo.split('/').map(encodeURIComponent).join('/')
  const url = `${GITHUB_API_BASE}/repos/${repoPath}${path}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  let response

  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'nobelium-guest-comments',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    })
  } catch (error) {
    const reason = error?.name === 'AbortError' ? '请求超时' : '网络连接失败'
    throw new GitHubCommentsError(`GitHub ${reason}。`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    const message = response.status === 401 || response.status === 403
      ? 'GitHub 拒绝了留言存储 Token。'
      : response.status === 404
        ? 'GitHub 留言仓库不存在，或 Token 没有 Issues 权限。'
        : response.status === 429
          ? 'GitHub API 请求过于频繁。'
          : `GitHub 留言服务返回了状态码 ${response.status}。`

    console.error(`[comments] GitHub API ${response.status}: ${details.slice(0, 500)}`)
    throw new GitHubCommentsError(message, response.status)
  }

  if (response.status === 204) return null
  return response.json()
}

function validateIssueNumber (value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new GitHubCommentsError('GitHub 返回了无效的 Issue 编号。')
  }
  return number
}

function normalizeSingleLine (value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength + 1)
}

function normalizeContent (value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH + 1)
}

function normalizePageUrl (value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString().slice(0, 500)
  } catch {
    return ''
  }
}

function escapeMarkdown (value) {
  return String(value)
    .replace(/[\\`*_{}\[\]()<>#+.!|~>-]/g, '\\$&')
    .replace(/@/g, '@\u200B')
}