export const MAX_CHAT_MESSAGES = 24
export const MAX_MESSAGE_LENGTH = 12000
export const MAX_TOTAL_TEXT_LENGTH = 120000
export const MAX_SYSTEM_PROMPT_LENGTH = 4000
export const MAX_ATTACHMENTS_PER_MESSAGE = 3
export const MAX_TOTAL_IMAGE_ATTACHMENTS = 4
export const MAX_IMAGE_ATTACHMENT_BYTES = 700 * 1024
export const MAX_TEXT_ATTACHMENT_LENGTH = 120000

const IMAGE_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/x-yaml',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/yaml'
])
const TEXT_EXTENSIONS = new Set(['csv', 'json', 'log', 'md', 'markdown', 'txt', 'yaml', 'yml'])
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/

export function normalizeChatRequest (payload = {}) {
  if (!Array.isArray(payload.messages)) {
    throw new TypeError('messages must be an array')
  }

  const messages = payload.messages
    .slice(-MAX_CHAT_MESSAGES)
    .map((message, index) => normalizeMessage(message, index))

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new TypeError('the last message must be from the user')
  }

  const totalLength = messages.reduce((sum, message) => {
    return sum + message.content.length + message.attachments
      .filter(attachment => attachment.type === 'text')
      .reduce((attachmentSum, attachment) => attachmentSum + attachment.content.length, 0)
  }, 0)
  if (totalLength > MAX_TOTAL_TEXT_LENGTH) {
    throw new RangeError('conversation is too long')
  }

  const totalImages = messages.reduce((sum, message) => {
    return sum + message.attachments.filter(attachment => attachment.type === 'image').length
  }, 0)
  if (totalImages > MAX_TOTAL_IMAGE_ATTACHMENTS) {
    throw new TypeError(`一次最多发送 ${MAX_TOTAL_IMAGE_ATTACHMENTS} 张图片`)
  }

  const systemPrompt = normalizeText(payload.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH)
  const articleContext = normalizeText(payload.articleContext, MAX_SYSTEM_PROMPT_LENGTH)
  const temperature = clampNumber(payload.temperature, 0, 1, 0.4)
  const useBlogContext = payload.useBlogContext !== false

  return {
    messages,
    systemPrompt,
    articleContext,
    useBlogContext,
    temperature
  }
}

function normalizeMessage (message, index) {
  if (!message || !['user', 'assistant'].includes(message.role)) {
    throw new TypeError(`invalid message role at index ${index}`)
  }

  const content = normalizeText(message.content, MAX_MESSAGE_LENGTH)
  const attachments = normalizeAttachments(message.attachments, message.role, index)
  if (!content && !attachments.length) {
    throw new TypeError(`empty message at index ${index}`)
  }

  return { role: message.role, content, attachments }
}

function normalizeAttachments (value, role, messageIndex) {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError(`invalid attachments at index ${messageIndex}`)
  if (role !== 'user' && value.length) throw new TypeError('attachments are only allowed on user messages')
  if (value.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new TypeError(`每条消息最多添加 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`)
  }
  return value.map((attachment, attachmentIndex) => normalizeAttachment(
    attachment,
    `attachment ${attachmentIndex} on message ${messageIndex}`
  ))
}

function normalizeAttachment (attachment, label) {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
    throw new TypeError(`${label} is invalid`)
  }

  const name = normalizeFileName(attachment.name, label)
  const type = String(attachment.type || '').trim().toLowerCase()
  if (type === 'image') return normalizeImageAttachment(attachment, name, label)
  if (type === 'text') return normalizeTextAttachment(attachment, name, label)
  throw new TypeError(`${label} has an unsupported type`)
}

function normalizeImageAttachment (attachment, name, label) {
  const mimeType = String(attachment.mimeType || '').trim().toLowerCase()
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new TypeError(`${label} uses an unsupported image type`)

  const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl.trim() : ''
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) throw new TypeError(`${label} is not a valid data URL`)

  const encoded = dataUrl.slice(prefix.length)
  if (!encoded || !BASE64_PATTERN.test(encoded)) throw new TypeError(`${label} contains invalid image data`)
  const byteLength = estimateBase64Bytes(encoded)
  if (byteLength > MAX_IMAGE_ATTACHMENT_BYTES) {
    throw new TypeError(`${label} exceeds the ${Math.round(MAX_IMAGE_ATTACHMENT_BYTES / 1024)} KB image limit`)
  }

  return {
    type: 'image',
    name,
    mimeType,
    dataUrl,
    size: byteLength
  }
}

function normalizeTextAttachment (attachment, name, label) {
  const mimeType = String(attachment.mimeType || '').trim().toLowerCase()
  const extension = name.split('.').pop()?.toLowerCase() || ''
  if (!TEXT_MIME_TYPES.has(mimeType) && !TEXT_EXTENSIONS.has(extension)) {
    throw new TypeError(`${label} uses an unsupported text file type`)
  }

  if (typeof attachment.content !== 'string') throw new TypeError(`${label} has invalid text content`)
  const content = attachment.content.replace(/\u0000/gu, '').trim()
  if (!content) throw new TypeError(`${label} is empty`)
  if (content.length > MAX_TEXT_ATTACHMENT_LENGTH) {
    throw new TypeError(`${label} exceeds the ${MAX_TEXT_ATTACHMENT_LENGTH} character text limit`)
  }

  return {
    type: 'text',
    name,
    mimeType: mimeType || inferTextMimeType(extension),
    content,
    size: content.length
  }
}

function normalizeFileName (value, label) {
  const name = String(value || '').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 120)
  if (!name) throw new TypeError(`${label} has an invalid file name`)
  return name
}

function normalizeText (value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function inferTextMimeType (extension) {
  if (extension === 'json') return 'application/json'
  if (extension === 'csv') return 'text/csv'
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'yaml' || extension === 'yml') return 'text/yaml'
  return 'text/plain'
}

function estimateBase64Bytes (encoded) {
  const normalized = encoded.replace(/\s/gu, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.floor((normalized.length * 3) / 4 - padding)
}

function clampNumber (value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
