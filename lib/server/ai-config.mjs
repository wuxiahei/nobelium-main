import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  randomUUID
} from 'node:crypto'
import { BlobNotFoundError, del, get, put } from '@vercel/blob'
import {
  DEFAULT_AI_PROTOCOL,
  DEFAULT_AI_USER_AGENT,
  normalizeAIProtocol,
  normalizeAIUserAgent
} from '../ai/provider.mjs'

const AI_CONFIG_BLOB_PATH = 'settings/ai-config-v1.json'
const AI_CONFIG_BLOB_ACCESS = 'public'
const AI_CONFIG_VERSION = 3
const LEGACY_AI_CONFIG_VERSION = 1
const PREVIOUS_AI_CONFIG_VERSION = 2
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_DISPLAY_NAME = 'AI 助手'
const DEFAULT_PROFILE_NAME = '默认配置'
const ENV_PROFILE_NAME = '环境变量配置'
const LEGACY_PROFILE_ID = 'legacy-default'
const MAX_AI_PROFILES = 10
const MAX_BASE_URL_LENGTH = 2048
const MAX_MODEL_LENGTH = 160
const MAX_DISPLAY_NAME_LENGTH = 48
const MAX_PROFILE_NAME_LENGTH = 48
const MAX_API_KEY_LENGTH = 4096
const PROFILE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/

export class AIConfigurationError extends Error {
  constructor (message, status = 400) {
    super(message)
    this.name = 'AIConfigurationError'
    this.status = status
  }
}

export function getAIEnvConfig () {
  const warnings = []
  let baseURL = DEFAULT_BASE_URL
  let model = ''
  let displayName = DEFAULT_DISPLAY_NAME
  let protocol = DEFAULT_AI_PROTOCOL
  let userAgent = DEFAULT_AI_USER_AGENT

  try {
    baseURL = normalizeAIBaseURL(process.env.AI_BASE_URL || DEFAULT_BASE_URL)
  } catch (error) {
    warnings.push(`AI_BASE_URL 无效，已回退到 ${DEFAULT_BASE_URL}。`)
  }

  try {
    model = normalizeAIModel(process.env.AI_MODEL || '', { allowEmpty: true })
  } catch (error) {
    warnings.push('AI_MODEL 无效，请在后台重新配置模型名称。')
  }

  try {
    displayName = normalizeAIDisplayName(process.env.AI_DISPLAY_NAME || DEFAULT_DISPLAY_NAME)
  } catch (error) {
    warnings.push(`AI_DISPLAY_NAME 无效，已回退到“${DEFAULT_DISPLAY_NAME}”。`)
  }

  try {
    protocol = normalizeAIProtocol(process.env.AI_API_PROTOCOL || DEFAULT_AI_PROTOCOL)
  } catch (error) {
    warnings.push(`AI_API_PROTOCOL 无效，已回退到 ${DEFAULT_AI_PROTOCOL}。`)
  }

  try {
    userAgent = normalizeAIUserAgent(process.env.AI_USER_AGENT || DEFAULT_AI_USER_AGENT)
  } catch (error) {
    warnings.push(`AI_USER_AGENT 无效，已回退到 ${DEFAULT_AI_USER_AGENT}。`)
  }

  return {
    apiKey: String(process.env.AI_API_KEY || '').trim(),
    baseURL,
    model,
    displayName,
    protocol,
    userAgent,
    profileName: ENV_PROFILE_NAME,
    timeoutMs: clampNumber(process.env.AI_TIMEOUT_MS, 5000, 180000, 60000),
    maxOutputTokens: clampNumber(process.env.AI_MAX_OUTPUT_TOKENS, 256, 65536, 2048),
    source: 'environment',
    updatedAt: null,
    warning: warnings.join(' ')
  }
}

export async function getAIServerConfig () {
  return (await getAIServerState()).config
}

export async function getPublicAIConfig () {
  const config = await getAIServerConfig()
  return toPublicAIConfig(config)
}

export function toPublicAIConfig (config) {
  // Model, endpoint, profile identifiers and credentials stay server-side.
  return {
    enabled: Boolean(config?.apiKey && config?.model),
    displayName: config?.displayName || DEFAULT_DISPLAY_NAME,
    storage: 'browser-only'
  }
}

export async function getAdminAIConfigView () {
  return toAdminAIConfigView(await getAIServerState())
}

export function toAdminAIConfigView (state) {
  const encryptionSecret = getEncryptionSecret()
  const canPersist = Boolean(getBlobToken()) && encryptionSecret.length >= 32
  let persistenceWarning = ''

  if (!getBlobToken()) {
    persistenceWarning = '请先在 Vercel 配置 BLOB_READ_WRITE_TOKEN，才能从后台保存 AI 配置。'
  } else if (encryptionSecret.length < 32) {
    persistenceWarning = '请配置至少 32 字符的 ADMIN_SESSION_SECRET，或单独配置 AI_CONFIG_ENCRYPTION_KEY，以加密保存整份 AI 配置。'
  }

  const profiles = (state.profiles || []).map(profile => ({
    id: profile.id,
    profileName: profile.profileName,
    baseURL: profile.baseURL,
    model: profile.model,
    displayName: profile.displayName,
    protocol: profile.protocol,
    apiKeyConfigured: Boolean(profile.encryptedApiKey),
    updatedAt: profile.updatedAt,
    isActive: profile.id === state.activeProfileId
  }))
  const activeProfile = profiles.find(profile => profile.isActive)

  return {
    profiles,
    activeProfileId: state.activeProfileId,
    profileName: activeProfile?.profileName || state.config.profileName || ENV_PROFILE_NAME,
    baseURL: state.config.baseURL,
    model: state.config.model,
    displayName: state.config.displayName,
    protocol: state.config.protocol || DEFAULT_AI_PROTOCOL,
    userAgent: state.config.userAgent || DEFAULT_AI_USER_AGENT,
    apiKeyConfigured: Boolean(state.config.apiKey),
    source: state.source,
    updatedAt: state.updatedAt,
    canPersist,
    canReset: Boolean(getBlobToken()) && profiles.length > 0,
    maxProfiles: MAX_AI_PROFILES,
    persistenceWarning,
    warning: state.warning || ''
  }
}

export async function saveAdminAIConfig (input, options) {
  return saveAdminAIProfile(input, options)
}

export async function saveAdminAIProfile (input, {
  readStoredConfig = readStoredAIConfig,
  writeBlob = put
} = {}) {
  assertConfigurationInput(input)
  const token = requireBlobToken()
  const secret = requireEncryptionSecret()
  const submittedApiKey = readSubmittedApiKey(input)
  const profileId = normalizeAIProfileId(input.profileId, { allowEmpty: true })
  let currentState = null
  let readError = null

  try {
    currentState = await readStoredConfig()
  } catch (error) {
    readError = error
    console.error('[ai-config] Unable to read current configuration before save:', error)
  }

  const currentProfile = profileId
    ? currentState?.profiles?.find(profile => profile.id === profileId)
    : null
  let currentApiKey = ''

  if (!submittedApiKey) {
    if (currentProfile?.encryptedApiKey) {
      currentApiKey = decryptSecret(currentProfile.encryptedApiKey, secret)
      if (!currentApiKey) {
        throw new AIConfigurationError('当前档案的 API Key 无法解密，请填写新的 API Key 后保存。', 503)
      }
    } else if (!currentProfile) {
      currentApiKey = getAIEnvConfig().apiKey
    }
  }

  if (!submittedApiKey && !currentApiKey) {
    const message = readError
      ? '无法读取旧 API Key，请填写新的 API Key 后保存。'
      : '请填写 API Key。'
    throw new AIConfigurationError(message, readError ? 503 : 400)
  }

  const normalized = normalizeAdminAIConfigInput(input, submittedApiKey || currentApiKey)
  const profiles = currentState?.profiles?.length ? [...currentState.profiles] : []
  if (!currentProfile && profiles.length >= MAX_AI_PROFILES) {
    throw new AIConfigurationError(`最多只能保存 ${MAX_AI_PROFILES} 套 AI 配置。`)
  }

  const now = new Date().toISOString()
  const nextProfile = {
    id: currentProfile?.id || randomUUID(),
    profileName: normalizeAIProfileName(
      input.profileName || currentProfile?.profileName || normalized.displayName || DEFAULT_PROFILE_NAME
    ),
    baseURL: normalized.baseURL,
    model: normalized.model,
    displayName: normalized.displayName,
    protocol: normalized.protocol,
    encryptedApiKey: encryptSecret(normalized.apiKey, secret),
    updatedAt: now
  }

  const existingIndex = profiles.findIndex(profile => profile.id === nextProfile.id)
  if (existingIndex >= 0) profiles[existingIndex] = nextProfile
  else profiles.unshift(nextProfile)

  const shouldActivate = input.activate !== false
  const activeProfileId = shouldActivate || !currentState?.activeProfileId
    ? nextProfile.id
    : currentState.activeProfileId
  const record = buildStoredRecord(profiles, activeProfileId, now, secret)

  await writeStoredRecord(record, { writeBlob, token })
  return {
    ...toAdminAIConfigView(buildStateFromRecord(record, secret)),
    savedProfileId: nextProfile.id
  }
}

export async function activateAdminAIProfile (profileId, {
  readStoredConfig = readStoredAIConfig,
  writeBlob = put
} = {}) {
  const token = requireBlobToken()
  const secret = requireEncryptionSecret()
  const id = normalizeAIProfileId(profileId)
  const state = await requireStoredState(readStoredConfig)
  if (!state.profiles.some(profile => profile.id === id)) {
    throw new AIConfigurationError('找不到要切换的 AI 配置。', 404)
  }

  const now = new Date().toISOString()
  const record = buildStoredRecord(state.profiles, id, now, secret)
  await writeStoredRecord(record, { writeBlob, token })
  return toAdminAIConfigView(buildStateFromRecord(record, secret))
}

export async function deleteAdminAIProfile (profileId, {
  readStoredConfig = readStoredAIConfig,
  writeBlob = put,
  deleteBlob = del
} = {}) {
  const token = requireBlobToken()
  const secret = requireEncryptionSecret()
  const id = normalizeAIProfileId(profileId)
  const state = await requireStoredState(readStoredConfig)
  if (!state.profiles.some(profile => profile.id === id)) {
    throw new AIConfigurationError('找不到要删除的 AI 配置。', 404)
  }

  const profiles = state.profiles.filter(profile => profile.id !== id)
  if (!profiles.length) {
    await deleteStoredRecord({ deleteBlob, token })
    return toAdminAIConfigView(getEnvironmentState())
  }

  const nextActiveId = state.activeProfileId === id ? profiles[0].id : state.activeProfileId
  const now = new Date().toISOString()
  const record = buildStoredRecord(profiles, nextActiveId, now, secret)
  await writeStoredRecord(record, { writeBlob, token })
  return toAdminAIConfigView(buildStateFromRecord(record, secret))
}

export async function resetAdminAIConfig () {
  const token = requireBlobToken()
  await deleteStoredRecord({ deleteBlob: del, token })
  return toAdminAIConfigView(getEnvironmentState())
}

export function normalizeAIBaseURL (value) {
  const raw = stripProviderEndpointSuffix(String(value || '').trim())
  if (!raw) throw new AIConfigurationError('请填写 AI 接口 URL。')
  if (raw.length > MAX_BASE_URL_LENGTH) throw new AIConfigurationError('AI 接口 URL 过长。')
  if (/[\u0000-\u001f\u007f]/u.test(raw)) throw new AIConfigurationError('AI 接口 URL 包含无效字符。')

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new AIConfigurationError('AI 接口 URL 格式不正确。')
  }

  const allowHttp = process.env.NODE_ENV !== 'production' && (!process.env.VERCEL || process.env.VERCEL === '0')
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new AIConfigurationError('AI 接口 URL 必须使用 HTTPS。')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AIConfigurationError('AI 接口 URL 不能包含账号、查询参数或片段。')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  return (`${url.origin}${url.pathname}`).replace(/\/+$/, '')
}

export function normalizeAIModel (value, { allowEmpty = false } = {}) {
  const model = String(value || '').trim()
  if (!model && !allowEmpty) throw new AIConfigurationError('请填写模型名称。')
  if (model.length > MAX_MODEL_LENGTH) throw new AIConfigurationError('模型名称过长。')
  if (model && (/[\u0000-\u001f\u007f]/u.test(model) || /\s{2,}/u.test(model))) {
    throw new AIConfigurationError('模型名称包含无效字符。')
  }
  return model
}

export function normalizeAIDisplayName (value) {
  const displayName = String(value || '').replace(/\s+/gu, ' ').trim()
  if (!displayName) throw new AIConfigurationError('请填写显示名称。')
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) throw new AIConfigurationError('显示名称不能超过 48 个字符。')
  return displayName
}

export function normalizeAIProfileName (value) {
  const profileName = String(value || '').replace(/\s+/gu, ' ').trim()
  if (!profileName) throw new AIConfigurationError('请填写配置名称。')
  if (profileName.length > MAX_PROFILE_NAME_LENGTH) throw new AIConfigurationError('配置名称不能超过 48 个字符。')
  if (/[\u0000-\u001f\u007f]/u.test(profileName)) throw new AIConfigurationError('配置名称包含无效字符。')
  return profileName
}

export function encryptSecret (plaintext, secret) {
  const value = String(plaintext || '')
  const key = deriveEncryptionKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url')
  }
}

export function decryptSecret (payload, secret) {
  try {
    const key = deriveEncryptionKey(secret)
    const iv = Buffer.from(String(payload?.iv || ''), 'base64url')
    const tag = Buffer.from(String(payload?.tag || ''), 'base64url')
    const data = Buffer.from(String(payload?.data || ''), 'base64url')
    if (!iv.length || !tag.length || !data.length) return ''
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

async function getAIServerState () {
  let stored = null
  try {
    stored = await readStoredAIConfig()
  } catch (error) {
    console.error('[ai-config] Unable to read saved configuration:', error)
    return {
      ...getEnvironmentState(),
      warning: buildReadWarning(error)
    }
  }

  return stored || getEnvironmentState()
}

function getEnvironmentState () {
  const config = getAIEnvConfig()
  return {
    config,
    profiles: [],
    activeProfileId: null,
    source: 'environment',
    updatedAt: null,
    warning: config.warning
  }
}

async function readStoredAIConfig () {
  const token = getBlobToken()
  if (!token) return null

  let result
  try {
    result = await get(AI_CONFIG_BLOB_PATH, {
      access: AI_CONFIG_BLOB_ACCESS,
      useCache: false,
      token
    })
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null
    throw error
  }
  if (!result || result.statusCode !== 200 || !result.stream) return null

  const raw = await new Response(result.stream).text()
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    throw new AIConfigurationError('已保存的 AI 配置格式损坏。')
  }

  return buildStateFromRecord(record)
}

function buildStateFromRecord (record, secret = getEncryptionSecret()) {
  if (!record || ![LEGACY_AI_CONFIG_VERSION, PREVIOUS_AI_CONFIG_VERSION, AI_CONFIG_VERSION].includes(record.version)) {
    throw new AIConfigurationError('已保存的 AI 配置版本不受支持。')
  }

  const decryptedRecord = record.version === AI_CONFIG_VERSION
    ? decryptStoredRecord(record, secret)
    : record
  const profiles = decryptedRecord.version === LEGACY_AI_CONFIG_VERSION
    ? [legacyRecordToProfile(decryptedRecord)]
    : normalizeStoredProfiles(decryptedRecord.profiles)
  if (!profiles.length) throw new AIConfigurationError('已保存的 AI 配置没有可用档案。')

  const activeProfileId = profiles.some(profile => profile.id === decryptedRecord.activeProfileId)
    ? decryptedRecord.activeProfileId
    : profiles[0].id
  const activeProfile = profiles.find(profile => profile.id === activeProfileId)
  let apiKey = ''
  let warning = ''

  if (activeProfile.encryptedApiKey) {
    apiKey = decryptSecret(activeProfile.encryptedApiKey, requireEncryptionSecret())
    if (!apiKey) warning = '当前 AI 配置的 API Key 无法解密，请在后台重新填写并保存。'
  }

  return {
    config: {
      apiKey,
      baseURL: activeProfile.baseURL,
      model: activeProfile.model,
      displayName: activeProfile.displayName,
      protocol: activeProfile.protocol,
      userAgent: resolveAIUserAgent(),
      profileName: activeProfile.profileName,
      timeoutMs: clampNumber(process.env.AI_TIMEOUT_MS, 5000, 180000, 60000),
      maxOutputTokens: clampNumber(process.env.AI_MAX_OUTPUT_TOKENS, 256, 65536, 2048)
    },
    profiles,
    activeProfileId,
    source: 'admin',
    updatedAt: typeof decryptedRecord.updatedAt === 'string' ? decryptedRecord.updatedAt : activeProfile.updatedAt,
    warning
  }
}

function decryptStoredRecord (record, secret) {
  const plaintext = decryptSecret(record.payload, secret)
  if (!plaintext) {
    throw new AIConfigurationError('已保存的 AI 配置无法解密，请填写新的 API Key 后覆盖保存。', 503)
  }

  let payload
  try {
    payload = JSON.parse(plaintext)
  } catch {
    throw new AIConfigurationError('已保存的 AI 配置载荷格式损坏。')
  }
  return {
    version: PREVIOUS_AI_CONFIG_VERSION,
    activeProfileId: payload.activeProfileId,
    profiles: payload.profiles,
    updatedAt: payload.updatedAt
  }
}

function legacyRecordToProfile (record) {
  return normalizeStoredProfile({
    id: LEGACY_PROFILE_ID,
    profileName: DEFAULT_PROFILE_NAME,
    baseURL: record.baseURL,
    model: record.model,
    displayName: record.displayName,
    protocol: record.protocol,
    apiKey: record.apiKey,
    updatedAt: record.updatedAt
  })
}

function normalizeStoredProfiles (profiles) {
  if (!Array.isArray(profiles)) throw new AIConfigurationError('已保存的 AI 配置档案格式损坏。')
  if (profiles.length > MAX_AI_PROFILES) throw new AIConfigurationError(`已保存的 AI 配置超过 ${MAX_AI_PROFILES} 套。`)

  const normalized = profiles.map((profile, index) => normalizeStoredProfile({
    ...profile,
    id: profile?.id || `profile-${index + 1}`
  }))
  const ids = new Set(normalized.map(profile => profile.id))
  if (ids.size !== normalized.length) throw new AIConfigurationError('已保存的 AI 配置存在重复标识。')
  return normalized
}

function normalizeStoredProfile (profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new AIConfigurationError('已保存的 AI 配置档案格式损坏。')
  }
  const apiKeyPayload = profile.encryptedApiKey || profile.apiKey || null
  return {
    id: normalizeAIProfileId(profile.id),
    profileName: normalizeAIProfileName(profile.profileName || DEFAULT_PROFILE_NAME),
    baseURL: normalizeAIBaseURL(profile.baseURL),
    model: profile.model ? normalizeAIModel(profile.model) : '',
    displayName: normalizeAIDisplayName(profile.displayName || DEFAULT_DISPLAY_NAME),
    protocol: normalizeConfiguredProtocol(profile.protocol),
    encryptedApiKey: apiKeyPayload,
    updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : null
  }
}

function buildStoredRecord (profiles, activeProfileId, updatedAt, secret) {
  const payload = {
    activeProfileId,
    profiles: profiles.map(profile => ({
      id: profile.id,
      profileName: profile.profileName,
      baseURL: profile.baseURL,
      model: profile.model,
      displayName: profile.displayName,
      protocol: profile.protocol,
      apiKey: profile.encryptedApiKey,
      updatedAt: profile.updatedAt
    })),
    updatedAt
  }
  return {
    version: AI_CONFIG_VERSION,
    payload: encryptSecret(JSON.stringify(payload), secret)
  }
}

async function writeStoredRecord (record, { writeBlob, token }) {
  try {
    await writeBlob(AI_CONFIG_BLOB_PATH, JSON.stringify(record), {
      access: AI_CONFIG_BLOB_ACCESS,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
      token
    })
  } catch (error) {
    console.error('[ai-config] Unable to save configuration:', error)
    throw new AIConfigurationError(`AI 配置保存失败：${describeBlobStorageError(error)}`, 502)
  }
}

async function deleteStoredRecord ({ deleteBlob, token }) {
  try {
    await deleteBlob(AI_CONFIG_BLOB_PATH, { token })
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) {
      console.error(`[ai-config] Unable to reset configuration: ${error.message}`)
      throw new AIConfigurationError('AI 配置重置失败，请稍后重试。', 502)
    }
  }
}

async function requireStoredState (readStoredConfig) {
  const state = await readStoredConfig()
  if (!state || state.source !== 'admin' || !state.profiles?.length) {
    throw new AIConfigurationError('后台尚未保存 AI 配置。', 404)
  }
  return state
}

function normalizeAdminAIConfigInput (input, apiKey) {
  return {
    apiKey,
    baseURL: normalizeAIBaseURL(input.baseURL),
    model: normalizeAIModel(input.model),
    protocol: normalizeConfiguredProtocol(input.protocol),
    displayName: normalizeAIDisplayName(input.displayName || DEFAULT_DISPLAY_NAME)
  }
}

function assertConfigurationInput (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AIConfigurationError('AI 配置内容无效。')
  }
}

function readSubmittedApiKey (input) {
  assertConfigurationInput(input)
  const submittedKey = String(input.apiKey || '').trim()
  if (submittedKey.length > MAX_API_KEY_LENGTH) {
    throw new AIConfigurationError('API Key 过长。')
  }
  if (/[\u0000-\u001f\u007f]/u.test(submittedKey)) {
    throw new AIConfigurationError('API Key 包含无效字符。')
  }
  return submittedKey
}

function normalizeAIProfileId (value, { allowEmpty = false } = {}) {
  const id = String(value || '').trim()
  if (!id && allowEmpty) return ''
  if (!id || !PROFILE_ID_PATTERN.test(id)) throw new AIConfigurationError('AI 配置标识无效。')
  return id
}

function buildReadWarning (error) {
  if (error instanceof AIConfigurationError) {
    return `${error.message} 填写新的 API Key 后可直接保存覆盖。`
  }
  return `AI 配置存储读取失败：${describeBlobStorageError(error)} 填写新的 API Key 后可直接保存覆盖。`
}

function normalizeConfiguredProtocol (value) {
  try {
    return normalizeAIProtocol(value)
  } catch (error) {
    throw new AIConfigurationError(error.message)
  }
}

function resolveAIUserAgent () {
  try {
    return normalizeAIUserAgent(process.env.AI_USER_AGENT || DEFAULT_AI_USER_AGENT)
  } catch {
    return DEFAULT_AI_USER_AGENT
  }
}

function describeBlobStorageError (error) {
  const name = String(error?.name || '')
  const message = String(error?.message || '')
  const detail = `${name} ${message}`
  if (/invalid token|unable to extract store id/i.test(detail)) {
    return 'BLOB_READ_WRITE_TOKEN 无效或已失效，请在 Vercel 重新连接 Blob 存储。'
  }
  if (/access denied|unauthorized|forbidden|BlobAccessError/i.test(detail)) {
    return 'Blob 访问被拒绝，请确认 BLOB_READ_WRITE_TOKEN 与项目 Blob 存储的访问级别一致。'
  }
  if (/store.*not found|BlobStoreNotFoundError/i.test(detail)) {
    return '找不到 Blob 存储，请在 Vercel 重新连接 BLOB_READ_WRITE_TOKEN。'
  }
  if (/rate limit|too many requests|BlobServiceRateLimited/i.test(detail)) {
    return 'Blob 服务请求过于频繁，请稍后重试。'
  }
  if (/fetch blob:\s*4\d\d/i.test(detail)) {
    return 'Blob 请求被拒绝，请检查存储访问级别和 Token 权限。'
  }
  return 'Blob 服务暂时不可用，请稍后重试。'
}

function clampNumber (value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function deriveEncryptionKey (secret) {
  const value = String(secret || '')
  if (value.length < 32) throw new AIConfigurationError('AI 配置加密密钥至少需要 32 个字符。', 503)
  return Buffer.from(hkdfSync('sha256', value, 'nobelium-ai-config', 'provider-api-key-v1', 32))
}

function stripProviderEndpointSuffix (value) {
  return value
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/responses\/?$/i, '')
}

function getBlobToken () {
  return String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()
}

function getEncryptionSecret () {
  return String(process.env.AI_CONFIG_ENCRYPTION_KEY || process.env.ADMIN_SESSION_SECRET || '').trim()
}

function requireBlobToken () {
  const token = getBlobToken()
  if (!token) throw new AIConfigurationError('请先在 Vercel 配置 BLOB_READ_WRITE_TOKEN，才能保存 AI 配置。', 503)
  return token
}

function requireEncryptionSecret () {
  const secret = getEncryptionSecret()
  if (secret.length < 32) {
    throw new AIConfigurationError('请配置至少 32 字符的 ADMIN_SESSION_SECRET 或 AI_CONFIG_ENCRYPTION_KEY。', 503)
  }
  return secret
}
