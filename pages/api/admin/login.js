import {
  createAdminSessionCookie,
  createAdminSessionToken,
  getAdminAuthConfig,
  verifyAdminCredentials
} from '@/lib/server/admin-auth.mjs'
import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  getClientId,
  sendAdminError,
  takeRateLimitSlot
} from '@/lib/server/admin-api.mjs'

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LIMIT = 8
const rateLimitStore = globalThis.__nobeliumAdminLoginRateLimitStore || new Map()
globalThis.__nobeliumAdminLoginRateLimitStore = rateLimitStore

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      throw new AdminRequestError('Method not allowed.', 405)
    }

    assertSameOriginRequest(req)
    assertJsonRequest(req)

    if (!takeRateLimitSlot(rateLimitStore, getClientId(req), LOGIN_LIMIT, RATE_LIMIT_WINDOW_MS)) {
      res.setHeader('Retry-After', String(Math.floor(RATE_LIMIT_WINDOW_MS / 1000)))
      throw new AdminRequestError('登录尝试过于频繁，请稍后再试。', 429)
    }

    const config = getAdminAuthConfig()
    if (!config.configured) {
      throw new AdminRequestError(config.setupError || '管理员账户尚未配置。', 503)
    }

    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!verifyAdminCredentials(username, password)) {
      throw new AdminRequestError('管理员账号或密码不正确。', 401)
    }

    const token = createAdminSessionToken(config.username)
    res.setHeader('Set-Cookie', createAdminSessionCookie(token))
    return res.status(200).json({ authenticated: true, username: config.username })
  } catch (error) {
    return sendAdminError(res, error)
  }
}