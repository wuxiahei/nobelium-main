import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AIConfigurationError,
  activateAdminAIProfile,
  decryptSecret,
  deleteAdminAIProfile,
  encryptSecret,
  getAIEnvConfig,
  normalizeAIBaseURL,
  normalizeAIDisplayName,
  normalizeAIModel,
  saveAdminAIConfig,
  saveAdminAIProfile,
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
    displayName: 'Writing assistant',
    storage: 'browser-only'
  })
  assert.equal(Object.hasOwn(publicConfig, 'apiKey'), false)
  assert.equal(Object.hasOwn(publicConfig, 'baseURL'), false)
  assert.equal(Object.hasOwn(publicConfig, 'model'), false)
  assert.equal(Object.hasOwn(publicConfig, 'activeProfileId'), false)
  assert.equal(Object.hasOwn(publicConfig, 'profiles'), false)
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

  assert.equal(readCount, 1)
  assert.equal(savedOptions.access, 'public')
  assert.equal(savedOptions.allowOverwrite, true)
  assert.equal(result.source, 'admin')
  assert.equal(result.apiKeyConfigured, true)
  assert.equal(result.warning, '')
  assert.equal(result.protocol, 'responses')
  assert.match(result.savedProfileId, /^[a-zA-Z0-9_-]{1,80}$/)
  const stored = JSON.parse(savedRecord)
  assert.equal(stored.version, 3)
  assert.equal(Object.hasOwn(stored, 'profiles'), false)
  assert.equal(Object.hasOwn(stored, 'activeProfileId'), false)
  assert.equal(typeof stored.payload?.data, 'string')
  assert.equal(JSON.stringify(stored).includes('sk-new-secret-value'), false)

  const payload = decryptStoredPayload(stored, 's'.repeat(40))
  assert.equal(payload.profiles.length, 1)
  assert.equal(payload.profiles[0].protocol, 'responses')
  assert.equal(payload.profiles[0].apiKey.data.length > 0, true)
})

test('encrypted AI configuration rejects wrong keys and damaged payloads', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  const wrongSecret = 'w'.repeat(40)
  const payload = {
    activeProfileId: 'profile-1',
    profiles: [{
      id: 'profile-1',
      profileName: '内部线路',
      baseURL: 'https://provider.example.com/v1',
      model: 'provider-model',
      displayName: 'AI 助手',
      protocol: 'chat_completions',
      apiKey: encryptSecret('sk-private-key', 's'.repeat(40)),
      updatedAt: '2026-01-01T00:00:00.000Z'
    }],
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
  const wrongKeyStorage = createMemoryStorage({
    version: 3,
    payload: encryptSecret(JSON.stringify(payload), wrongSecret)
  })

  await assert.rejects(
    activateAdminAIProfile('profile-1', wrongKeyStorage.options),
    error => error instanceof AIConfigurationError && error.status === 503 && /无法解密/.test(error.message)
  )

  const damagedStorage = createMemoryStorage({
    version: 3,
    payload: encryptSecret('{not-valid-json', 's'.repeat(40))
  })
  await assert.rejects(
    activateAdminAIProfile('profile-1', damagedStorage.options),
    error => error instanceof AIConfigurationError && /载荷格式损坏/.test(error.message)
  )
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

test('administrators can save, activate and delete multiple AI profiles without re-entering keys', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  const storage = createMemoryStorage()
  const primaryView = await saveAdminAIProfile({
    profileName: '主力线路',
    baseURL: 'https://primary.example.com/v1',
    model: 'primary-model',
    displayName: '写作助手',
    protocol: 'chat_completions',
    apiKey: 'sk-primary-secret',
    activate: true
  }, storage.options)
  const primaryId = primaryView.savedProfileId
  assert.ok(primaryId)
  assert.equal(primaryView.activeProfileId, primaryId)
  assert.equal(primaryView.profiles.length, 1)

  const backupView = await saveAdminAIProfile({
    profileName: '备用线路',
    baseURL: 'https://backup.example.com/v1',
    model: 'backup-model',
    displayName: '备用助手',
    protocol: 'responses',
    apiKey: 'sk-backup-secret',
    activate: false
  }, storage.options)
  const backupId = backupView.savedProfileId
  assert.ok(backupId)
  assert.notEqual(backupId, primaryId)
  assert.equal(backupView.profiles.length, 2)
  assert.equal(backupView.activeProfileId, primaryId)
  assert.equal(backupView.savedProfileId, backupId)
  assert.equal(backupView.profiles.find(profile => profile.id === backupId).isActive, false)

  const stored = storage.getRecord()
  assert.equal(stored.version, 3)
  assert.equal(Object.hasOwn(stored, 'profiles'), false)
  assert.equal(Object.hasOwn(stored, 'activeProfileId'), false)
  assert.equal(typeof stored.payload?.data, 'string')
  assert.equal(JSON.stringify(stored).includes('sk-primary-secret'), false)
  assert.equal(JSON.stringify(stored).includes('sk-backup-secret'), false)
  assert.equal(JSON.stringify(stored).includes('primary.example.com'), false)
  assert.equal(JSON.stringify(stored).includes('primary-model'), false)
  assert.equal(JSON.stringify(stored).includes('主力线路'), false)
  assert.equal(JSON.stringify(stored).includes('写作助手'), false)

  const payload = decryptStoredPayload(stored, 's'.repeat(40))
  assert.equal(payload.profiles.length, 2)
  assert.ok(payload.profiles.every(profile => profile.apiKey?.data))

  const activatedView = await activateAdminAIProfile(backupId, storage.options)
  assert.equal(activatedView.activeProfileId, backupId)
  assert.equal(activatedView.profiles.find(profile => profile.id === backupId).isActive, true)
  assert.equal(activatedView.profiles.find(profile => profile.id === primaryId).isActive, false)
  assert.equal(activatedView.apiKeyConfigured, true)

  const deletedView = await deleteAdminAIProfile(backupId, storage.options)
  assert.equal(deletedView.profiles.length, 1)
  assert.equal(deletedView.activeProfileId, primaryId)

  const resetView = await deleteAdminAIProfile(primaryId, storage.options)
  assert.equal(resetView.source, 'environment')
  assert.equal(resetView.profiles.length, 0)
  assert.equal(storage.getRecord(), null)
  assert.equal(storage.getDeleteCount(), 1)
})

test('legacy v1 settings are migrated into an editable profile', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  const secret = 's'.repeat(40)
  const legacyRecord = {
    version: 1,
    baseURL: 'https://legacy.example.com/v1',
    model: 'legacy-model',
    displayName: '旧版助手',
    protocol: 'responses',
    apiKey: encryptSecret('sk-legacy-secret', secret),
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
  const storage = createMemoryStorage(legacyRecord)
  const view = await saveAdminAIProfile({
    profileId: 'legacy-default',
    profileName: '迁移后的旧配置',
    baseURL: legacyRecord.baseURL,
    model: legacyRecord.model,
    displayName: legacyRecord.displayName,
    protocol: legacyRecord.protocol,
    apiKey: ''
  }, storage.options)

  assert.equal(view.activeProfileId, 'legacy-default')
  assert.equal(view.savedProfileId, 'legacy-default')
  assert.equal(view.profiles.length, 1)
  assert.equal(view.profiles[0].profileName, '迁移后的旧配置')
  assert.equal(view.profiles[0].apiKeyConfigured, true)
  assert.equal(view.profiles[0].model, 'legacy-model')

  const migrated = storage.getRecord()
  assert.equal(migrated.version, 3)
  assert.equal(Object.hasOwn(migrated, 'profiles'), false)
  assert.equal(Object.hasOwn(migrated, 'activeProfileId'), false)
  assert.equal(JSON.stringify(migrated).includes('sk-legacy-secret'), false)

  const payload = decryptStoredPayload(migrated, 's'.repeat(40))
  assert.equal(payload.profiles.length, 1)
  assert.equal(payload.activeProfileId, 'legacy-default')
  assert.equal(payload.profiles[0].baseURL, 'https://legacy.example.com/v1')
  assert.equal(payload.profiles[0].apiKey.data.length > 0, true)
})

test('the persisted profile count is bounded', async t => {
  t.after(restoreOriginalEnv)
  applyEnv({
    NODE_ENV: 'production',
    BLOB_READ_WRITE_TOKEN: 'blob-test-token',
    ADMIN_SESSION_SECRET: 's'.repeat(40)
  })

  const secret = 's'.repeat(40)
  const profiles = Array.from({ length: 10 }, (_, index) => ({
    id: `profile-${index + 1}`,
    profileName: `线路 ${index + 1}`,
    baseURL: 'https://provider.example.com/v1',
    model: 'provider-model',
    displayName: 'AI 助手',
    protocol: 'chat_completions',
    apiKey: encryptSecret(`sk-limit-${index + 1}`, secret),
    updatedAt: '2026-01-01T00:00:00.000Z'
  }))
  const storage = createMemoryStorage({
    version: 2,
    activeProfileId: 'profile-1',
    profiles,
    updatedAt: '2026-01-01T00:00:00.000Z'
  })

  await assert.rejects(
    saveAdminAIProfile({
      profileName: '第十一套',
      baseURL: 'https://provider.example.com/v1',
      model: 'provider-model',
      displayName: 'AI 助手',
      protocol: 'chat_completions',
      apiKey: 'sk-too-many'
    }, storage.options),
    error => error instanceof AIConfigurationError && /最多只能保存 10 套/.test(error.message)
  )
  assert.equal(storage.getRecord().profiles.length, 10)
})

function createMemoryStorage (initialRecord = null, secret = 's'.repeat(40)) {
  let record = initialRecord
  let deleteCount = 0
  return {
    options: {
      readStoredConfig: async () => record ? stateFromRecord(record, secret) : null,
      writeBlob: async (pathname, body, options) => {
        assert.equal(pathname, 'settings/ai-config-v1.json')
        assert.equal(options.access, 'public')
        assert.equal(options.allowOverwrite, true)
        record = JSON.parse(body)
        return { pathname, url: `https://example.com/${pathname}` }
      },
      deleteBlob: async () => {
        deleteCount += 1
        record = null
      }
    },
    getRecord: () => record,
    getDeleteCount: () => deleteCount
  }
}

function stateFromRecord (record, secret) {
  if (record.version === 1) {
    return {
      source: 'admin',
      activeProfileId: 'legacy-default',
      updatedAt: record.updatedAt,
      profiles: [{
        id: 'legacy-default',
        profileName: '默认配置',
        baseURL: record.baseURL,
        model: record.model,
        displayName: record.displayName,
        protocol: record.protocol,
        encryptedApiKey: record.apiKey,
        updatedAt: record.updatedAt
      }]
    }
  }

  const payload = record.version === 3 ? decryptStoredPayload(record, secret) : record
  return {
    source: 'admin',
    activeProfileId: payload.activeProfileId,
    updatedAt: payload.updatedAt || record.updatedAt,
    profiles: payload.profiles.map(profile => ({
      ...profile,
      encryptedApiKey: profile.apiKey || profile.encryptedApiKey
    }))
  }
}

function decryptStoredPayload (record, secret) {
  const plaintext = decryptSecret(record.payload, secret)
  if (!plaintext) throw new AIConfigurationError('已保存的 AI 配置无法解密，请填写新的 API Key 后覆盖保存。', 503)
  try {
    return JSON.parse(plaintext)
  } catch {
    throw new AIConfigurationError('已保存的 AI 配置载荷格式损坏。')
  }
}
