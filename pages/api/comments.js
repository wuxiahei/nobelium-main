import { getAdminSession } from '@/lib/server/admin-auth.mjs'
import {
  CommentsConfigurationError,
  GitHubCommentsError,
  addGuestComment,
  listGuestComments,
  validateCommentInput,
  validatePageId
} from '@/lib/server/github-comments.mjs'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const WRITE_LIMIT = 5
const READ_LIMIT = 120
const rateLimitStore = globalThis.__nobeliumCommentsRateLimitStore || new Map()
globalThis.__nobeliumCommentsRateLimitStore = rateLimitStore

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res)
    }

    if (req.method === 'POST') {
      return await handlePost(req, res)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return sendError(res, error)
  }
}

async function handleGet (req, res) {
  if (!takeRateLimitSlot('read', getClientId(req), READ_LIMIT)) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: '留言读取过于频繁，请稍后再试。' })
  }

  const rawPageId = Array.isArray(req.query.pageId) ? req.query.pageId[0] : req.query.pageId
  let pageId
  try {
    pageId = validatePageId(rawPageId)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const comments = await listGuestComments(pageId)
  return res.status(200).json({ comments })
}

async function handlePost (req, res) {
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: '请求来源无效。' })
  }

  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return res.status(415).json({ error: '请求必须使用 application/json。' })
  }

  if (!takeRateLimitSlot('write', getClientId(req), WRITE_LIMIT)) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: '留言过于频繁，请十分钟后再试。' })
  }

  validateCommentInput(req.body)
  const comment = await addGuestComment(req.body, { authenticatedAdmin: Boolean(getAdminSession(req)) })
  return res.status(201).json({ comment })
}

function sendError (res, error) {
  if (error instanceof CommentsConfigurationError) {
    return res.status(503).json({ error: '留言功能尚未配置。' })
  }

  if (error instanceof GitHubCommentsError) {
    console.error(`[comments] ${error.message}`)
    return res.status(502).json({ error: '留言服务暂时不可用，请稍后重试。' })
  }

  const message = error?.message || '留言请求无效。'
  return res.status(400).json({ error: message })
}

function isSameOriginRequest (req) {
  const requestHost = getRequestHost(req)
  if (!requestHost) return false

  const origin = req.headers.origin
  if (origin) return originMatchesHost(origin, requestHost)

  const referer = req.headers.referer
  if (referer) return originMatchesHost(referer, requestHost)

  // Non-browser clients normally omit both headers. Browser cross-site POSTs include Origin.
  return true
}

function originMatchesHost (value, requestHost) {
  try {
    return new URL(value).host.toLowerCase() === requestHost.toLowerCase()
  } catch {
    return false
  }
}

function getRequestHost (req) {
  const forwardedHost = req.headers['x-forwarded-host']
  if (typeof forwardedHost === 'string' && forwardedHost.trim()) {
    return forwardedHost.split(',')[0].trim()
  }
  return String(req.headers.host || '').trim()
}

function getClientId (req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

function takeRateLimitSlot (kind, clientId, limit) {
  const key = `${kind}:${clientId}`
  const now = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, startedAt: now })
    return true
  }

  if (current.count >= limit) return false
  current.count += 1
  return true
}