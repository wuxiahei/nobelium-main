import { AdminAuthError, getAdminSession } from './admin-auth.mjs'
import { GitHubContentError } from './github-posts.mjs'

export class AdminRequestError extends Error {
  constructor (message, status = 400) {
    super(message)
    this.name = 'AdminRequestError'
    this.status = status
  }
}

export function requireAdminRequest (req) {
  const session = getAdminSession(req)
  if (!session) throw new AdminAuthError('请先登录管理员账户。', 401)
  return session
}

export function assertSameOriginRequest (req) {
  const requestHost = getRequestHost(req)
  if (!requestHost) throw new AdminRequestError('请求来源无效。', 403)

  const origin = req.headers.origin
  if (origin) {
    if (!originMatchesHost(origin, requestHost)) {
      throw new AdminRequestError('请求来源无效。', 403)
    }
    return
  }

  const referer = req.headers.referer
  if (referer && !originMatchesHost(referer, requestHost)) {
    throw new AdminRequestError('请求来源无效。', 403)
  }
}

export function assertJsonRequest (req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    throw new AdminRequestError('请求必须使用 application/json。', 415)
  }
}

export function getClientId (req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function takeRateLimitSlot (store, key, limit, windowMs) {
  const normalizedKey = String(key || 'unknown')
  const now = Date.now()
  const current = store.get(normalizedKey)

  if (!current || now - current.startedAt >= windowMs) {
    store.set(normalizedKey, { count: 1, startedAt: now })
    return true
  }

  if (current.count >= limit) return false
  current.count += 1
  return true
}

export function sendAdminError (res, error) {
  if (error instanceof AdminAuthError) {
    return res.status(error.status || 401).json({ error: error.message })
  }

  if (error instanceof AdminRequestError) {
    return res.status(error.status || 400).json({ error: error.message })
  }

  if (error instanceof GitHubContentError) {
    const status = [400, 404, 409, 503].includes(error.status) ? error.status : 502
    console.error('[admin] ' + error.message)
    return res.status(status).json({ error: error.message })
  }

  console.error('[admin] Unhandled error:', error)
  return res.status(500).json({ error: '管理操作失败，请稍后重试。' })
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