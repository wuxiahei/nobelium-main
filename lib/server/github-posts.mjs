import { cleanMarkdownForSearch } from '../search-index.mjs'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 15000
const MAX_ISSUE_PAGES = 10
const MAX_POST_BODY_LENGTH = 60000
const DEFAULT_POST_LABEL = 'nobelium-post'
const DEFAULT_DRAFT_LABEL = 'nobelium-draft'
const DEFAULT_TAG_PREFIX = 'tag:'

export class GitHubContentError extends Error {
  constructor (message, status = 502) {
    super(message)
    this.name = 'GitHubContentError'
    this.status = status
  }
}

export function getGitHubContentConfig () {
  const repo = String(process.env.CONTENT_GITHUB_REPO || '').trim()
  const token = String(process.env.CONTENT_GITHUB_TOKEN || '').trim()

  return buildContentConfig(repo, token)
}

export function getGitHubWriteConfig () {
  const repo = String(process.env.CONTENT_GITHUB_REPO || '').trim()
  const token = String(process.env.CONTENT_GITHUB_TOKEN || '').trim()
  const config = buildContentConfig(repo, token)

  if (!config) {
    throw new GitHubContentError('请先配置 CONTENT_GITHUB_REPO 和 CONTENT_GITHUB_TOKEN。', 503)
  }

  if (!config.token) {
    throw new GitHubContentError('写文章需要配置服务端 CONTENT_GITHUB_TOKEN。', 503)
  }

  return config
}

export function isGitHubWriteConfigured () {
  return Boolean(
    String(process.env.CONTENT_GITHUB_REPO || '').trim() &&
    String(process.env.CONTENT_GITHUB_TOKEN || '').trim()
  )
}

export function parseFrontMatter (body) {
  const source = String(body || '').replace(/\r\n?/g, '\n')
  if (!source.startsWith('---\n')) return { data: {}, content: source }

  const end = source.indexOf('\n---\n', 4)
  if (end < 0) return { data: {}, content: source }

  const data = Object.create(null)
  const lines = source.slice(4, end).split('\n')
  let currentKey = ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const listMatch = line.match(/^\s*-\s+(.*)$/)
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = []
      data[currentKey].push(parseScalar(listMatch[1]))
      continue
    }

    const pairMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pairMatch) continue

    const [, key, rawValue] = pairMatch
    if (!isSafeKey(key)) continue
    currentKey = key
    data[key] = rawValue.trim() ? parseScalar(rawValue) : []
  }

  return {
    data,
    content: source.slice(end + 5).replace(/^\n/, '')
  }
}

export function parseGitHubIssue (issue, config = getGitHubContentConfig(), options = {}) {
  if (!config || !issue || issue.pull_request) return null

  const labels = getLabelNames(issue)
  if (!labels.includes(config.label)) return null

  const draft = Boolean(config.draftLabel && labels.includes(config.draftLabel))
  if (draft && !options.includeDrafts) return null

  const number = Number(issue.number)
  if (!Number.isInteger(number) || number <= 0) return null

  const title = normalizeSingleLine(issue.title, 180)
  if (!title) return null

  const { data, content } = parseFrontMatter(issue.body)
  const explicitSlug = normalizeSlug(data.slug)
  const generatedSlug = slugify(title)
  const date = parseIssueDate(data.date) || parseIssueDate(issue.created_at) || Date.now()
  const tagLabels = labels
    .filter(label => label.startsWith(config.tagPrefix))
    .map(label => label.slice(config.tagPrefix.length))

  return {
    id: 'github-' + number,
    title,
    slug: explicitSlug || (generatedSlug ? generatedSlug + '-' + number : 'post-' + number),
    summary: normalizeSingleLine(data.summary, 300) || extractSummary(content),
    tags: unique([...parseList(data.tags), ...tagLabels]),
    type: ['Post'],
    status: [draft ? 'Draft' : 'Published'],
    date,
    publishedAt: date,
    fullWidth: false,
    source: 'github',
    draft,
    githubIssueNumber: number,
    githubIssueUrl: normalizeGitHubUrl(issue.html_url),
    updatedAt: normalizeTimestamp(issue.updated_at) || normalizeTimestamp(issue.created_at) || '',
    ...(options.includeSearchText ? { searchText: cleanMarkdownForSearch(content) } : {})
  }
}

export async function listGitHubPosts (options = {}) {
  const config = getGitHubContentConfig()
  if (!config) return []

  const issues = await listIssues(config)
  return issues
    .map(issue => parseGitHubIssue(issue, config, options))
    .filter(Boolean)
}

export async function listAdminGitHubPosts () {
  const config = getGitHubWriteConfig()
  const issues = await listIssues(config)
  return issues
    .map(issue => parseGitHubIssue(issue, config, { includeDrafts: true }))
    .filter(Boolean)
}

export async function listAdminGitHubPostDocuments () {
  const config = getGitHubWriteConfig()
  const issues = await listIssues(config)

  return issues
    .map(issue => {
      const post = parseGitHubIssue(issue, config, { includeDrafts: true })
      if (!post) return null
      return {
        post,
        content: parseFrontMatter(issue.body).content
      }
    })
    .filter(Boolean)
}

export async function getGitHubPostMarkdown (issueNumber) {
  const config = getGitHubContentConfig()
  if (!config) throw new GitHubContentError('GitHub 文章源尚未配置。', 503)

  const issue = await getIssue(config, issueNumber)
  const post = parseGitHubIssue(issue, config)
  if (!post) {
    throw new GitHubContentError('该 GitHub Issue 不是已发布的文章。', 404)
  }

  return parseFrontMatter(issue.body).content
}

export async function getAdminGitHubPost (issueNumber) {
  const config = getGitHubWriteConfig()
  const issue = await getIssue(config, issueNumber)
  const post = parseGitHubIssue(issue, config, { includeDrafts: true })
  if (!post) {
    throw new GitHubContentError('该 GitHub Issue 不是文章。', 404)
  }

  return {
    post,
    content: parseFrontMatter(issue.body).content
  }
}

export async function createGitHubPost (input) {
  const config = getGitHubWriteConfig()
  const post = normalizeAdminPostInput(input)

  await ensureGitHubLabel(config, config.label, '0f766e', 'Nobelium blog posts')
  if (post.draft) {
    await ensureGitHubLabel(config, config.draftLabel, 'b45309', 'Unpublished Nobelium drafts')
  }

  const labels = [config.label]
  if (post.draft) labels.push(config.draftLabel)

  const issue = await githubRequest(config, '/issues', {
    method: 'POST',
    body: {
      title: post.title,
      body: composeIssueBody(post),
      labels
    }
  })

  return parseGitHubIssue(issue, config, { includeDrafts: true })
}

export async function updateGitHubPost (issueNumber, input) {
  const config = getGitHubWriteConfig()
  const issue = await getIssue(config, issueNumber)
  const existing = parseGitHubIssue(issue, config, { includeDrafts: true })
  if (!existing) {
    throw new GitHubContentError('该 GitHub Issue 不是可编辑的文章。', 404)
  }

  const expectedUpdatedAt = normalizeTimestamp(input?.expectedUpdatedAt)
  if (expectedUpdatedAt && existing.updatedAt && expectedUpdatedAt !== existing.updatedAt) {
    throw new GitHubContentError('这篇文章已在其他标签页或 GitHub 上被修改。当前内容未覆盖线上版本，请重新打开文章后再合并修改。', 409)
  }

  const post = normalizeAdminPostInput(input)
  await ensureGitHubLabel(config, config.label, '0f766e', 'Nobelium blog posts')
  if (post.draft) {
    await ensureGitHubLabel(config, config.draftLabel, 'b45309', 'Unpublished Nobelium drafts')
  }

  const currentLabels = getLabelNames(issue)
  const labels = unique([
    ...currentLabels.filter(label => label !== config.label && label !== config.draftLabel),
    config.label,
    ...(post.draft ? [config.draftLabel] : [])
  ])

  const updated = await githubRequest(config, '/issues/' + existing.githubIssueNumber, {
    method: 'PATCH',
    body: {
      title: post.title,
      body: composeIssueBody(post),
      labels,
      state: 'open'
    }
  })

  return {
    previousSlug: existing.slug,
    post: parseGitHubIssue(updated, config, { includeDrafts: true })
  }
}

function buildContentConfig (repo, token) {
  if (!repo) return null
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new GitHubContentError('CONTENT_GITHUB_REPO 必须使用 owner/repository 格式。', 503)
  }

  return {
    repo,
    token,
    label: String(process.env.CONTENT_GITHUB_LABEL || DEFAULT_POST_LABEL).trim() || DEFAULT_POST_LABEL,
    draftLabel: String(process.env.CONTENT_GITHUB_DRAFT_LABEL || DEFAULT_DRAFT_LABEL).trim() || DEFAULT_DRAFT_LABEL,
    tagPrefix: String(process.env.CONTENT_GITHUB_TAG_PREFIX || DEFAULT_TAG_PREFIX).trim() || DEFAULT_TAG_PREFIX
  }
}

async function listIssues (config) {
  const issues = []
  for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
    const query = new URLSearchParams({
      state: 'open',
      labels: config.label,
      per_page: '100',
      page: String(page),
      sort: 'created',
      direction: 'desc'
    })
    const batch = await githubRequest(config, '/issues?' + query.toString())
    if (!Array.isArray(batch)) break
    issues.push(...batch)
    if (batch.length < 100) break
  }
  return issues.filter(issue => !issue.pull_request)
}

async function getIssue (config, issueNumber) {
  const number = Number(issueNumber)
  if (!Number.isInteger(number) || number <= 0) {
    throw new GitHubContentError('GitHub Issue 编号无效。', 400)
  }
  return githubRequest(config, '/issues/' + number)
}

async function ensureGitHubLabel (config, name, color, description) {
  const label = String(name || '').trim()
  if (!label) return

  try {
    await githubRequest(config, '/labels/' + encodeURIComponent(label))
    return
  } catch (error) {
    if (!(error instanceof GitHubContentError) || error.status !== 404) throw error
  }

  try {
    await githubRequest(config, '/labels', {
      method: 'POST',
      body: { name: label, color, description }
    })
  } catch (error) {
    if (error instanceof GitHubContentError && error.status === 422) return
    throw error
  }
}

async function githubRequest (config, path, options = {}) {
  const repoPath = config.repo.split('/').map(encodeURIComponent).join('/')
  const url = GITHUB_API_BASE + '/repos/' + repoPath + path
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  const method = options.method || 'GET'
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'nobelium-github-content',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  if (config.token) headers.Authorization = 'Bearer ' + config.token

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    })
  } catch (error) {
    const reason = error?.name === 'AbortError' ? '请求超时' : '网络连接失败'
    throw new GitHubContentError('GitHub ' + reason + '。')
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    console.error('[content] GitHub API ' + response.status + ': ' + details.slice(0, 500))
    const message = response.status === 401 || response.status === 403
      ? 'GitHub 拒绝了文章读写凭证，请检查 Token 的 Issues 权限。'
      : response.status === 404
        ? 'GitHub 文章仓库、Issue 或标签不存在。'
        : response.status === 422
          ? 'GitHub 拒绝了文章内容或标签，请检查配置。'
          : response.status === 429
            ? 'GitHub API 请求过于频繁。'
            : 'GitHub 文章服务返回了状态码 ' + response.status + '。'
    throw new GitHubContentError(message, response.status)
  }

  if (response.status === 204) return null
  return response.json()
}

function normalizeAdminPostInput (input) {
  const value = input && typeof input === 'object' ? input : {}
  const title = normalizeSingleLine(value.title, 180)
  const content = String(value.content || '').replace(/\r\n?/g, '\n').trim()
  const draft = value.draft === true || value.draft === 'true'
  const tags = unique(parseList(value.tags).slice(0, 8).map(tag => normalizeSingleLine(tag, 40)))
  const date = normalizeDateInput(value.date)
  const slug = normalizeSlug(value.slug)
  const summary = normalizeSingleLine(value.summary, 300)

  if (!title) throw new GitHubContentError('请输入文章标题。', 400)
  if (!draft && !content) throw new GitHubContentError('已发布文章必须有正文。', 400)
  if (content.length > MAX_POST_BODY_LENGTH) {
    throw new GitHubContentError('文章正文不能超过 60000 个字符。', 400)
  }

  return { title, content, draft, tags, date, slug, summary }
}

function composeIssueBody (post) {
  const lines = [
    '---',
    'slug: ' + JSON.stringify(post.slug || ''),
    'summary: ' + JSON.stringify(post.summary || ''),
    'date: ' + post.date,
    'tags:'
  ]

  if (post.tags.length) {
    for (const tag of post.tags) lines.push('  - ' + JSON.stringify(tag))
  } else {
    lines.push('  []')
  }

  lines.push('---', '', post.content)
  return lines.join('\n')
}

function normalizeDateInput (value) {
  const raw = String(value || '').trim()
  const date = raw ? new Date(raw) : new Date()
  if (Number.isNaN(date.getTime())) {
    throw new GitHubContentError('文章日期无效。', 400)
  }
  return date.toISOString().slice(0, 10)
}

function getLabelNames (issue) {
  if (!Array.isArray(issue.labels)) return []
  return issue.labels
    .map(label => typeof label === 'string' ? label : label?.name)
    .filter(Boolean)
    .map(label => String(label).trim())
}

function parseScalar (value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (raw.startsWith('[') && raw.endsWith(']')) {
    return parseList(raw.slice(1, -1))
  }

  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw.slice(1, -1)
    }
  }

  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1)
  }

  return raw
}

function parseList (value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => parseList(item))
  }

  return String(value || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(item => normalizeSingleLine(item, 80))
    .filter(Boolean)
}

function parseIssueDate (value) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value).trim())
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function extractSummary (content) {
  const blocks = String(content || '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)

  for (const block of blocks) {
    if (/^(#{1,6}\s|!\[|\[!\[|>\s*!\[)/.test(block)) continue
    const text = block
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[#>*+\-\d.\s]+/, '')
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) return text.slice(0, 180)
  }

  return ''
}

function slugify (value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function normalizeSlug (value) {
  if (value === undefined || value === null || Array.isArray(value)) return ''
  return slugify(value)
}

function normalizeSingleLine (value, maxLength) {
  if (value === undefined || value === null || Array.isArray(value)) return ''
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeGitHubUrl (value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.toString() : ''
  } catch {
    return ''
  }
}

function normalizeTimestamp (value) {
  if (value === undefined || value === null || value === '') return ''
  const date = new Date(String(value).trim())
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function unique (values) {
  return [...new Set(values.map(value => normalizeSingleLine(value, 80)).filter(Boolean))]
}

function isSafeKey (key) {
  return !['__proto__', 'prototype', 'constructor'].includes(key)
}