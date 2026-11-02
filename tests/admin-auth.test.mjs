import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionCookie,
  createAdminSessionToken,
  getAdminAuthConfig,
  hashAdminPassword,
  verifyAdminCredentials,
  verifyAdminSessionToken
} from '../lib/server/admin-auth.mjs'
import {
  assertSameOriginRequest,
  requireAdminRequest,
  takeRateLimitSlot
} from '../lib/server/admin-api.mjs'

const AUTH_ENV_KEYS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'ADMIN_SESSION_TTL_SECONDS',
  'NODE_ENV',
  'VERCEL'
]
const originalEnv = snapshotEnv(AUTH_ENV_KEYS)

function applyEnv (values) {
  for (const key of AUTH_ENV_KEYS) delete process.env[key]
  Object.assign(process.env, values)
}

function restoreOriginalEnv () {
  restoreEnv(AUTH_ENV_KEYS, originalEnv)
}

function snapshotEnv (keys) {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function restoreEnv (keys, values) {
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
}

test('administrator credentials create signed sessions that reject tampering and expiry', t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'correct horse battery staple',
    ADMIN_SESSION_SECRET: 's'.repeat(40),
    ADMIN_SESSION_TTL_SECONDS: '3600',
    NODE_ENV: 'production'
  })

  assert.equal(getAdminAuthConfig().configured, true)
  assert.equal(verifyAdminCredentials('admin', 'correct horse battery staple'), true)
  assert.equal(verifyAdminCredentials('admin', 'wrong'), false)
  assert.equal(verifyAdminCredentials('other', 'correct horse battery staple'), false)

  const now = Math.floor(Date.now() / 1000) * 1000
  const token = createAdminSessionToken('admin', now)
  assert.deepEqual(verifyAdminSessionToken(token, now), {
    username: 'admin',
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString()
  })
  assert.equal(verifyAdminSessionToken(token, now + 61 * 60 * 1000), null)

  const [payload, signature] = token.split('.')
  const replacement = signature[0] === 'a' ? 'b' : 'a'
  assert.equal(verifyAdminSessionToken(payload + '.' + replacement + signature.slice(1), now), null)

  const cookie = createAdminSessionCookie(token)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /Max-Age=3600/)

  assert.deepEqual(
    requireAdminRequest({ headers: { cookie: ADMIN_COOKIE_NAME + '=' + token } }),
    {
      username: 'admin',
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString()
    }
  )
  assert.throws(() => requireAdminRequest({ headers: {} }), error => error.status === 401)
})

test('scrypt password hashes are accepted without a plaintext password', t => {
  t.after(restoreOriginalEnv)
  const hash = hashAdminPassword('hashed-password', Buffer.alloc(16, 7))
  applyEnv({
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: '',
    ADMIN_PASSWORD_HASH: hash,
    ADMIN_SESSION_SECRET: 'h'.repeat(32)
  })

  assert.equal(verifyAdminCredentials('admin', 'hashed-password'), true)
  assert.equal(verifyAdminCredentials('admin', 'wrong-password'), false)
  assert.equal(hash.includes('hashed-password'), false)
})

test('admin requests enforce same-origin checks and bounded login attempts', t => {
  t.after(restoreOriginalEnv)
  applyEnv({ NODE_ENV: 'production' })

  assert.doesNotThrow(() => assertSameOriginRequest({
    headers: { host: 'blog.example.com', origin: 'https://blog.example.com' }
  }))
  assert.throws(
    () => assertSameOriginRequest({
      headers: { host: 'blog.example.com', origin: 'https://evil.example.com' }
    }),
    /请求来源无效/
  )

  const store = new Map()
  assert.equal(takeRateLimitSlot(store, '127.0.0.1', 2, 60_000), true)
  assert.equal(takeRateLimitSlot(store, '127.0.0.1', 2, 60_000), true)
  assert.equal(takeRateLimitSlot(store, '127.0.0.1', 2, 60_000), false)
})
