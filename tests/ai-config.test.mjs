import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AIConfigurationError,
  decryptSecret,
  encryptSecret,
  getAIEnvConfig,
  normalizeAIBaseURL,
  normalizeAIDisplayName,
  normalizeAIModel,
  toPublicAIConfig
} from '../lib/server/ai-config.mjs'

const AI_ENV_KEYS = [
  'NODE_ENV',
  'VERCEL',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_DISPLAY_NAME',
  'AI_TIMEOUT_MS',
  'AI_MAX_OUTPUT_TOKENS',
  'AI_CONFIG_ENCRYPTION_KEY',
  'ADMIN_SESSION_SECRET',
  'BLOB_READ_WRITE_TOKEN'
]
const originalEnv = snapshotEnv(AI_ENV_KEYS)

function applyEnv (values) {
  for (const key of AI_ENV_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value
  }
}

function restoreOriginalEnv () {
  restoreEnv(AI_ENV_KEYS, originalEnv)
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

test('AI base URLs normalize OpenAI-compatible endpoints and reject unsafe forms', t => {
  t.after(restoreOriginalEnv)
  applyEnv({ NODE_ENV: 'production' })

  assert.equal(
    normalizeAIBaseURL('https://api.example.com/v1/chat/completions'),
    'https://api.example.com/v1'
  )
  assert.equal(
    normalizeAIBaseURL('  https://api.example.com/v1/chat/completions/  '),
    'https://api.example.com/v1'
  )
  assert.equal(
    normalizeAIBaseURL('https://api.example.com/v1///'),
    'https://api.example.com/v1'
  )
  assert.equal(
    normalizeAIBaseURL('https://api.example.com'),
    'https://api.example.com'
  )

  assert.throws(
    () => normalizeAIBaseURL('http://api.example.com/v1'),
    error => error instanceof AIConfigurationError && /HTTPS/.test(error.message)
  )
  assert.throws(() => normalizeAIBaseURL('https://user@api.example.com/v1'), /不能包含账号/)
  assert.throws(() => normalizeAIBaseURL('https://api.example.com/v1?token=secret'), /查询参数/)
  assert.throws(() => normalizeAIBaseURL('https://api.example.com/v1#fragment'), /片段/)
  assert.throws(() => normalizeAIBaseURL('ftp://api.example.com/v1'), /HTTPS/)
  assert.throws(() => normalizeAIBaseURL(''), /请填写/)
})

test('local development can target an HTTP model endpoint', t => {
  t.after(restoreOriginalEnv)
  applyEnv({ NODE_ENV: 'development' })

  assert.equal(normalizeAIBaseURL('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1')
})

test('model and display names are trimmed and validated', t => {
  assert.equal(normalizeAIModel('  gpt-4.1-mini  '), 'gpt-4.1-mini')
  assert.equal(normalizeAIModel('', { allowEmpty: true }), '')
  assert.throws(() => normalizeAIModel(''), /请填写模型名称/)
  assert.throws(() => normalizeAIModel('model  with  spaces'), /无效字符/)
  assert.throws(() => normalizeAIModel('x'.repeat(161)), /过长/)

  assert.equal(normalizeAIDisplayName('  AI   Assistant  '), 'AI Assistant')
  assert.throws(() => normalizeAIDisplayName('   '), /请填写显示名称/)
  assert.throws(() => normalizeAIDisplayName('x'.repeat(49)), /不能超过 48/)
})

test('API keys round-trip through authenticated encryption without plaintext leakage', t => {
  const secret = 's'.repeat(40)
  const apiKey = 'sk-test-very-secret-value-1234567890'
  const encrypted = encryptSecret(apiKey, secret)

  assert.equal(decryptSecret(encrypted, secret), apiKey)
  assert.equal(JSON.stringify(encrypted).includes(apiKey), false)
  assert.equal(JSON.stringify(encrypted).includes('sk-test'), false)
  assert.equal(decryptSecret(encrypted, 'w'.repeat(40)), '')
  assert.equal(decryptSecret({ iv: '', tag: '', data: '' }, secret), '')
  assert.equal(decryptSecret(null, secret), '')

  assert.throws(
    () => encryptSecret(apiKey, 'short'),
    error => error instanceof AIConfigurationError && error.status === 503
  )
})

test('public AI configuration exposes availability without provider secrets', t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    AI_API_KEY: 'server-only-secret',
    AI_BASE_URL: 'https://provider.example.com/v1',
    AI_MODEL: 'provider-model',
    AI_DISPLAY_NAME: 'Writing assistant'
  })

  const config = getAIEnvConfig()
  const publicConfig = toPublicAIConfig(config)

  assert.deepEqual(publicConfig, {
    enabled: true,
    model: 'provider-model',
    displayName: 'Writing assistant',
    storage: 'browser-only'
  })
  assert.equal(Object.hasOwn(publicConfig, 'apiKey'), false)
  assert.equal(Object.hasOwn(publicConfig, 'baseURL'), false)
  assert.equal(toPublicAIConfig({ apiKey: '', model: 'provider-model' }).enabled, false)
})

test('environment configuration reports malformed values with safe fallbacks', t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    AI_API_KEY: 'server-only-secret',
    AI_BASE_URL: 'http://insecure.example.com/v1',
    AI_MODEL: 'bad  model',
    AI_DISPLAY_NAME: '   ',
    AI_TIMEOUT_MS: '999999',
    AI_MAX_OUTPUT_TOKENS: '1'
  })

  const config = getAIEnvConfig()

  assert.equal(config.baseURL, 'https://api.openai.com/v1')
  assert.equal(config.model, '')
  assert.equal(config.displayName, 'AI 助手')
  assert.equal(config.timeoutMs, 180000)
  assert.equal(config.maxOutputTokens, 256)
  assert.match(config.warning, /AI_BASE_URL 无效/)
  assert.match(config.warning, /AI_MODEL 无效/)
  assert.match(config.warning, /AI_DISPLAY_NAME 无效/)
})
