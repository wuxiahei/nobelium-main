import { normalizeChatRequest } from '@/lib/ai/messages.mjs'
import { buildAIProviderRequest, getAIResponseContent } from '@/lib/ai/provider.mjs'
import { getAIServerConfig } from '@/lib/server/ai-config.mjs'

const rateLimitStore = globalThis.__elyAIRateLimitStore || new Map()
globalThis.__elyAIRateLimitStore = rateLimitStore
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_REQUESTS = 20

export default async function handler (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let aiServerConfig
  try {
    aiServerConfig = await getAIServerConfig()
  } catch (error) {
    console.error(`[ai] Configuration unavailable: ${error.message}`)
    return res.status(503).json({ error: 'AI 服务配置暂时不可用，请联系管理员。' })
  }

  res.setHeader('Cache-Control', 'no-store')

  if (!aiServerConfig.apiKey || !aiServerConfig.model) {
    return res.status(503).json({ error: 'AI 服务尚未由管理员配置。' })
  }

  if (!takeRateLimitSlot(getClientId(req))) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: '请求过于频繁，请稍后再试。' })
  }

  let request
  try {
    request = normalizeChatRequest(req.body)
  } catch (error) {
    return res.status(400).json({ error: error.message || '会话内容无效。' })
  }

  const systemContent = [
    request.systemPrompt,
    request.articleContext ? `用户主动提供的文章上下文：\n${request.articleContext}` : ''
  ].filter(Boolean).join('\n\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), aiServerConfig.timeoutMs)

  try {
    const providerRequest = buildAIProviderRequest(aiServerConfig, request, systemContent)
    const response = await fetch(providerRequest.url, {
      ...providerRequest.init,
      signal: controller.signal
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(
        `[ai] Provider request failed with status ${response.status} using ${providerRequest.protocol}` +
        (detail ? `: ${detail.slice(0, 500)}` : '')
      )
      return res.status(502).json({ error: '模型服务暂时不可用，请稍后重试。' })
    }

    const data = await response.json()
    const content = getAIResponseContent(data, providerRequest.protocol)
    if (!content) {
      return res.status(502).json({ error: '模型没有返回可显示的内容。' })
    }

    return res.status(200).json({ message: content })
  } catch (error) {
    const message = error.name === 'AbortError'
      ? '模型响应超时，请缩短上下文后重试。'
      : '连接模型服务失败，请稍后重试。'
    console.error(`[ai] ${error.name || 'Error'}: ${error.message || 'request failed'}`)
    return res.status(502).json({ error: message })
  } finally {
    clearTimeout(timeout)
  }
}

function getClientId (req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

function takeRateLimitSlot (clientId) {
  const now = Date.now()
  const current = rateLimitStore.get(clientId)
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientId, { count: 1, startedAt: now })
    return true
  }

  if (current.count >= RATE_LIMIT_REQUESTS) return false
  current.count += 1
  return true
}
