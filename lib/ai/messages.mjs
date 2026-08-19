export const MAX_CHAT_MESSAGES = 24
export const MAX_MESSAGE_LENGTH = 12000
export const MAX_TOTAL_LENGTH = 48000
export const MAX_SYSTEM_PROMPT_LENGTH = 4000

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

  const totalLength = messages.reduce((sum, message) => sum + message.content.length, 0)
  if (totalLength > MAX_TOTAL_LENGTH) {
    throw new RangeError('conversation is too long')
  }

  const systemPrompt = normalizeText(payload.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH)
  const articleContext = normalizeText(payload.articleContext, MAX_SYSTEM_PROMPT_LENGTH)
  const temperature = clampNumber(payload.temperature, 0, 1, 0.4)

  return {
    messages,
    systemPrompt,
    articleContext,
    temperature
  }
}

function normalizeMessage (message, index) {
  if (!message || !['user', 'assistant'].includes(message.role)) {
    throw new TypeError(`invalid message role at index ${index}`)
  }

  const content = normalizeText(message.content, MAX_MESSAGE_LENGTH)
  if (!content) {
    throw new TypeError(`empty message at index ${index}`)
  }

  return { role: message.role, content }
}

function normalizeText (value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function clampNumber (value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
