const normalizedBaseURL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1')
  .trim()
  .replace(/\/+$/, '')

const aiServerConfig = {
  apiKey: process.env.AI_API_KEY?.trim() || '',
  baseURL: normalizedBaseURL,
  model: process.env.AI_MODEL?.trim() || '',
  displayName: process.env.AI_DISPLAY_NAME?.trim() || 'AI 助手',
  timeoutMs: Math.max(5000, Number(process.env.AI_TIMEOUT_MS) || 60000),
  maxOutputTokens: Math.max(256, Number(process.env.AI_MAX_OUTPUT_TOKENS) || 2048)
}

const publicAIConfig = {
  enabled: Boolean(aiServerConfig.apiKey && aiServerConfig.model),
  model: aiServerConfig.model,
  displayName: aiServerConfig.displayName,
  storage: 'browser-only'
}

module.exports = {
  aiServerConfig,
  publicAIConfig
}
