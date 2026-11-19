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
  saveAdminAIConfig,
  toPublicAIConfig
} from '../lib/server/ai-config.mjs'

const AI_ENV_KEYS = [
  'NODE_ENV',
  'VERCEL',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_DISPLAY_NAME',
  'AI_API_PROTOCOL',
  'AI_USER_AGENT',
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
    normalizeAIBaseURL('https://api.example.com/v1/responses'),
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
    AI_API_PROTOCOL: 'unsupported',
    AI_TIMEOUT_MS: '999999',
    AI_MAX_OUTPUT_TOKENS: '1'
  })

  const config = getAIEnvConfig()

  assert.equal(config.baseURL, 'https://api.openai.com/v1')
  assert.equal(config.model, '')
  assert.equal(config.displayName, 'AI 助手')
  assert.equal(config.protocol, 'chat_completions')
  assert.equal(config.timeoutMs, 180000)
  assert.equal(config.maxOutputTokens, 256)
  assert.match(config.warning, /AI_BASE_URL 无效/)
  assert.match(config.warning, /AI_MODEL 无效/)
  assert.match(config.warning, /AI_DISPLAY_NAME 无效/)
  assert.match(config.warning, /AI_API_PROTOCOL 无效/)
})

test('environment configuration supports Responses protocol and a custom user agent', t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    AI_API_KEY: 'server-only-secret',
    AI_BASE_URL: 'https://provider.example.com/v1',
    AI_MODEL: 'provider-model',
    AI_API_PROTOCOL: 'responses',
    AI_USER_AGENT: 'codex-test/1.0'
  })

  const config = getAIEnvConfig()
  assert.equal(config.protocol, 'responses')
  assert.equal(config.userAgent, 'codex-test/1.0')
  assert.equal(config.warning, '')
})

test('a new API key can overwrite unreadable saved AI configuration', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  let readCount = 0
  let savedRecord = ''
  let savedOptions = null
  const result = await saveAdminAIConfig({
    baseURL: 'https://api.example.com/v1',
    model: 'example-model',
    displayName: '写作助手',
    protocol: 'responses',
    apiKey: 'sk-new-secret-value'
  }, {
    readStoredConfig: async () => {
      readCount += 1
      throw new Error('old settings are unreadable')
    },
    writeBlob: async (pathname, body, options) => {
      assert.equal(pathname, 'settings/ai-config-v1.json')
      savedRecord = body
      savedOptions = options
      return { pathname, url: 'https://example.com/settings/ai-config-v1.json' }
    }
  })

  assert.equal(readCount, 0)
  assert.equal(savedOptions.access, 'public')
  assert.equal(savedOptions.allowOverwrite, true)
  assert.equal(result.source, 'admin')
  assert.equal(result.apiKeyConfigured, true)
  assert.equal(result.warning, '')
  assert.equal(result.protocol, 'responses')
  assert.equal(JSON.parse(savedRecord).version, 1)
  assert.equal(JSON.parse(savedRecord).protocol, 'responses')
  assert.equal(JSON.stringify(JSON.parse(savedRecord)).includes('sk-new-secret-value'), false)
})

test('saving without a new key refuses silent fallback when the old key is unreadable', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  let writeCount = 0
  await assert.rejects(
    saveAdminAIConfig({
      baseURL: 'https://api.example.com/v1',
      model: 'example-model',
      displayName: '写作助手',
      apiKey: ''
    }, {
      readStoredConfig: async () => { throw new Error('old settings are unreadable') },
      writeBlob: async () => { writeCount += 1 }
    }),
    error => error instanceof AIConfigurationError &&
      error.status === 503 &&
      /填写新的 API Key/.test(error.message)
  )
  assert.equal(writeCount, 0)
})
