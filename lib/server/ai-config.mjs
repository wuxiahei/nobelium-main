import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes
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
const AI_CONFIG_VERSION = 1
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_DISPLAY_NAME = 'AI 助手'
const MAX_BASE_URL_LENGTH = 2048
const MAX_MODEL_LENGTH = 160
const MAX_DISPLAY_NAME_LENGTH = 48
const MAX_API_KEY_LENGTH = 4096

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
    timeoutMs: clampNumber(process.env.AI_TIMEOUT_MS, 5000, 180000, 60000),
    maxOutputTokens: clampNumber(process.env.AI_MAX_OUTPUT_TOKENS, 256, 65536, 2048),
    source: 'environment',
    updatedAt: null,
    warning: warnings.join(' ')
  }
}

export async function getAIServerConfig () {
  let stored = null
  try {
    stored = await readStoredAIConfig()
  } catch (error) {
    console.error('[ai-config] Unable to read saved configuration:', error)
    return {
      ...getAIEnvConfig(),
      warning: buildReadWarning(error)
    }
  }

  if (!stored) return getAIEnvConfig()

  return {
    ...stored.config,
    source: 'admin',
    updatedAt: stored.updatedAt,
    warning: stored.warning
  }
}

export async function getPublicAIConfig () {
  const config = await getAIServerConfig()
  return toPublicAIConfig(config)
}

export function toPublicAIConfig (config) {
  return {
    enabled: Boolean(config?.apiKey && config?.model),
    model: config?.model || '',
    displayName: config?.displayName || DEFAULT_DISPLAY_NAME,
    storage: 'browser-only'
  }
}

export async function getAdminAIConfigView () {
  return toAdminAIConfigView(await getAIServerConfig())
}

function toAdminAIConfigView (config) {
  const encryptionSecret = getEncryptionSecret()
  const canPersist = Boolean(getBlobToken()) && encryptionSecret.length >= 32
  let persistenceWarning = ''

  if (!getBlobToken()) {
    persistenceWarning = '请先在 Vercel 配置 BLOB_READ_WRITE_TOKEN，才能从后台保存 AI 配置。'
  } else if (encryptionSecret.length < 32) {
    persistenceWarning = '请配置至少 32 字符的 ADMIN_SESSION_SECRET，或单独配置 AI_CONFIG_ENCRYPTION_KEY，以加密保存 API Key。'
  }

  return {
    baseURL: config.baseURL,
    model: config.model,
    displayName: config.displayName,
    protocol: config.protocol || DEFAULT_AI_PROTOCOL,
    userAgent: config.userAgent || DEFAULT_AI_USER_AGENT,
    apiKeyConfigured: Boolean(config.apiKey),
    source: config.source,
    updatedAt: config.updatedAt,
    canPersist,
    canReset: Boolean(getBlobToken()),
    persistenceWarning,
    warning: config.warning || ''
  }
}

export async function saveAdminAIConfig (input, {
  readStoredConfig = readStoredAIConfig,
  writeBlob = put
} = {}) {
  const token = requireBlobToken()
  const secret = requireEncryptionSecret()
  const submittedApiKey = readSubmittedApiKey(input)
  let currentApiKey = submittedApiKey || getAIEnvConfig().apiKey

  // A new key makes the old record irrelevant. This lets an administrator
  // recover by overwriting corrupt or inaccessible settings without first
  // successfully reading them.
  if (!submittedApiKey) {
    try {
      const stored = await readStoredConfig()
      if (stored?.config?.apiKey) currentApiKey = stored.config.apiKey
    } catch (error) {
      console.error('[ai-config] Unable to read current configuration before save:', error)
      if (!currentApiKey) {
        throw new AIConfigurationError('无法读取旧 API Key，请填写新的 API Key 后保存。', 503)
      }
    }
  }

  const config = normalizeAdminAIConfigInput(input, currentApiKey)
  const record = {
    version: AI_CONFIG_VERSION,
    baseURL: config.baseURL,
    model: config.model,
    displayName: config.displayName,
    protocol: config.protocol,
    apiKey: encryptSecret(config.apiKey, secret),
    updatedAt: new Date().toISOString()
  }

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

  return toAdminAIConfigView({
    ...config,
    source: 'admin',
    updatedAt: record.updatedAt,
    warning: ''
  })
}

export async function resetAdminAIConfig () {
  const token = requireBlobToken()
  try {
    await del(AI_CONFIG_BLOB_PATH, { token })
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) {
      console.error(`[ai-config] Unable to reset configuration: ${error.message}`)
      throw new AIConfigurationError('AI 配置重置失败，请稍后重试。', 502)
    }
  }
  return toAdminAIConfigView(getAIEnvConfig())
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
  if (!record || record.version !== AI_CONFIG_VERSION) {
    throw new AIConfigurationError('已保存的 AI 配置版本不受支持。')
  }

  let apiKey = ''
  let warning = ''
  if (record.apiKey) {
    apiKey = decryptSecret(record.apiKey, requireEncryptionSecret())
    if (!apiKey) warning = '已保存的 API Key 无法解密，请在后台重新填写并保存。'
  }

  return {
    config: {
      apiKey,
      baseURL: normalizeAIBaseURL(record.baseURL),
      model: record.model ? normalizeAIModel(record.model) : '',
      displayName: normalizeAIDisplayName(record.displayName || DEFAULT_DISPLAY_NAME),
      protocol: normalizeConfiguredProtocol(record.protocol),
      userAgent: resolveAIUserAgent(),
      timeoutMs: clampNumber(process.env.AI_TIMEOUT_MS, 5000, 180000, 60000),
      maxOutputTokens: clampNumber(process.env.AI_MAX_OUTPUT_TOKENS, 256, 65536, 2048)
    },
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    warning
  }
}

function normalizeAdminAIConfigInput (input, currentApiKey) {
  const submittedKey = readSubmittedApiKey(input)
  const apiKey = submittedKey || String(currentApiKey || '').trim()
  if (!apiKey) throw new AIConfigurationError('请填写 API Key。')

  return {
    apiKey,
    baseURL: normalizeAIBaseURL(input.baseURL),
    model: normalizeAIModel(input.model),
    protocol: normalizeConfiguredProtocol(input.protocol),
    displayName: normalizeAIDisplayName(input.displayName || DEFAULT_DISPLAY_NAME)
  }
}

function readSubmittedApiKey (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AIConfigurationError('AI 配置内容无效。')
  }

  const submittedKey = String(input.apiKey || '').trim()
  if (submittedKey.length > MAX_API_KEY_LENGTH) {
    throw new AIConfigurationError('API Key 过长。')
  }
  if (/[\u0000-\u001f\u007f]/u.test(submittedKey)) {
    throw new AIConfigurationError('API Key 包含无效字符。')
  }
  return submittedKey
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
