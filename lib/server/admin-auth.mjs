import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'node:crypto'

export const ADMIN_COOKIE_NAME = 'nobelium_admin_session'
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60
const MIN_SESSION_SECRET_LENGTH = 32
const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export class AdminAuthError extends Error {
  constructor (message, status = 401) {
    super(message)
    this.name = 'AdminAuthError'
    this.status = status
  }
}

export function getAdminAuthConfig () {
  const username = String(process.env.ADMIN_USERNAME || '').trim()
  const password = String(process.env.ADMIN_PASSWORD || '')
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim()
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || '')

  let setupError = ''
  if (!username) setupError = '请配置 ADMIN_USERNAME。'
  else if (!password && !passwordHash) setupError = '请配置 ADMIN_PASSWORD 或 ADMIN_PASSWORD_HASH。'
  else if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    setupError = 'ADMIN_SESSION_SECRET 至少需要 32 个字符。'
  }

  return {
    username,
    password,
    passwordHash,
    sessionSecret,
    configured: !setupError,
    setupError
  }
}

export function verifyAdminCredentials (usernameInput, passwordInput) {
  const config = getAdminAuthConfig()
  if (!config.configured) return false

  const username = String(usernameInput || '').trim()
  const password = String(passwordInput || '')
  if (!safeEqual(username, config.username)) return false

  if (config.passwordHash) {
    return verifyScryptPassword(password, config.passwordHash)
  }

  return safeEqual(password, config.password)
}

export function createAdminSessionToken (username, now = Date.now()) {
  const config = getAdminAuthConfig()
  if (!config.configured) {
    throw new AdminAuthError(config.setupError || '管理员账户尚未配置。', 503)
  }

  const ttl = getSessionTtlSeconds()
  const payload = Buffer.from(JSON.stringify({
    sub: String(username || config.username),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttl,
    nonce: randomBytes(12).toString('hex')
  })).toString('base64url')

  return payload + '.' + signPayload(payload, config.sessionSecret)
}

export function verifyAdminSessionToken (token, now = Date.now()) {
  const config = getAdminAuthConfig()
  if (!config.configured || typeof token !== 'string') return null
  if (token.length > 2048) return null

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  if (!safeEqual(signature, signPayload(payload, config.sessionSecret))) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const nowSeconds = Math.floor(now / 1000)
    if (!data || data.sub !== config.username) return null
    if (!Number.isInteger(data.iat) || !Number.isInteger(data.exp)) return null
    if (data.iat > nowSeconds + 60 || data.exp <= nowSeconds) return null
    if (data.exp - data.iat > MAX_SESSION_TTL_SECONDS) return null
    return {
      username: data.sub,
      issuedAt: new Date(data.iat * 1000).toISOString(),
      expiresAt: new Date(data.exp * 1000).toISOString()
    }
  } catch {
    return null
  }
}

export function getAdminSession (req, now = Date.now()) {
  const cookies = parseCookieHeader(req?.headers?.cookie || '')
  return verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME], now)
}

export function createAdminSessionCookie (token) {
  const ttl = getSessionTtlSeconds()
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  return [
    ADMIN_COOKIE_NAME + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + ttl,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ')
}

export function clearAdminSessionCookie () {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  return [
    ADMIN_COOKIE_NAME + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ')
}

export function parseCookieHeader (header) {
  const result = Object.create(null)
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      result[key] = decodeURIComponent(value)
    } catch {
      result[key] = value
    }
  }
  return result
}

export function hashAdminPassword (password, salt = randomBytes(16)) {
  const value = String(password || '')
  if (!value) throw new Error('Password cannot be empty.')
  const derived = scryptSync(value, salt, 64)
  return 'scrypt$' + Buffer.from(salt).toString('hex') + '$' + derived.toString('hex')
}

function verifyScryptPassword (password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  try {
    const expected = Buffer.from(hashHex, 'hex')
    if (!expected.length) return false
    const actual = scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function signPayload (payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual (left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest()
  const rightHash = createHash('sha256').update(String(right)).digest()
  return timingSafeEqual(leftHash, rightHash)
}

function getSessionTtlSeconds () {
  const configured = Number(process.env.ADMIN_SESSION_TTL_SECONDS)
  if (!Number.isInteger(configured) || configured <= 0) return ADMIN_SESSION_TTL_SECONDS
  return Math.min(configured, MAX_SESSION_TTL_SECONDS)
}