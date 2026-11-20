export const AI_PROTOCOLS = Object.freeze(['chat_completions', 'responses'])
export const DEFAULT_AI_PROTOCOL = 'chat_completions'
export const DEFAULT_AI_USER_AGENT = 'codex_cli_rs/0.104.0 (Windows NT 10.0; Win64; x64)'

const PROTOCOL_ALIASES = Object.freeze({
  chat: 'chat_completions',
  completions: 'chat_completions',
  chat_completions: 'chat_completions',
  response: 'responses',
  responses: 'responses'
})

export function normalizeAIProtocol (value) {
  const protocol = String(value || '').trim().toLowerCase()
  if (!protocol) return DEFAULT_AI_PROTOCOL
  const normalized = PROTOCOL_ALIASES[protocol]
  if (!normalized) throw new TypeError('接口协议只能是 chat_completions 或 responses。')
  return normalized
}

export function normalizeAIUserAgent (value) {
  const userAgent = String(value || '').replace(/\s+/gu, ' ').trim()
  if (!userAgent) return DEFAULT_AI_USER_AGENT
  if (userAgent.length > 512) throw new TypeError('User-Agent 不能超过 512 个字符。')
  if (/[\u0000-\u001f\u007f]/u.test(userAgent)) throw new TypeError('User-Agent 包含无效字符。')
  return userAgent
}

export function buildAIProviderRequest (config, request, systemContent, { stream = true } = {}) {
  const protocol = normalizeAIProtocol(config?.protocol)
  const userAgent = normalizeAIUserAgent(config?.userAgent)
  const endpoint = protocol === 'responses' ? '/responses' : '/chat/completions'
  const messages = request.messages.map(message => toProviderMessage(message, protocol))

  const body = protocol === 'responses'
    ? {
        model: config.model,
        ...(systemContent ? { instructions: systemContent } : {}),
        input: messages,
        temperature: request.temperature,
        max_output_tokens: config.maxOutputTokens,
        store: false,
        stream
      }
    : {
        model: config.model,
        messages: [
          ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
          ...messages
        ],
        temperature: request.temperature,
        max_tokens: config.maxOutputTokens,
        stream
      }

  return {
    protocol,
    url: `${config.baseURL}${endpoint}`,
    init: {
      method: 'POST',
      headers: {
        Accept: stream ? 'text/event-stream' : 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': userAgent
      },
      body: JSON.stringify(body)
    }
  }
}

function toProviderMessage (message, protocol) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  if (!attachments.length) return { role: message.role, content: message.content }

  const textAttachments = attachments
    .filter(attachment => attachment.type === 'text')
    .map(attachment => `\n\n附件「${attachment.name}」内容：\n\n${attachment.content}`)
    .join('')
  const text = message.content + textAttachments
  const images = attachments.filter(attachment => attachment.type === 'image')

  if (protocol === 'responses') {
    return {
      role: message.role,
      content: [
        ...(text ? [{ type: 'input_text', text }] : []),
        ...images.map(image => ({
          type: 'input_image',
          image_url: image.dataUrl
        }))
      ]
    }
  }

  return {
    role: message.role,
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      ...images.map(image => ({
        type: 'image_url',
        image_url: { url: image.dataUrl }
      }))
    ]
  }
}

export function getAIResponseContent (data, protocol) {
  const normalizedProtocol = normalizeAIProtocol(protocol)

  if (normalizedProtocol === 'responses') {
    if (typeof data?.output_text === 'string') {
      const text = data.output_text.trim()
      if (text) return text
    }

    if (Array.isArray(data?.output)) {
      const text = data.output
        .flatMap(item => {
          if (typeof item?.text === 'string') return [item.text]
          if (!Array.isArray(item?.content)) return []
          return item.content
            .filter(part => ['output_text', 'text'].includes(part?.type) && typeof part?.text === 'string')
            .map(part => part.text)
        })
        .join('\n')
        .trim()
      if (text) return text
    }
  }

  // Some gateways expose a Responses-compatible URL but return Chat Completions
  // shaped JSON. Keeping this fallback makes those providers usable too.
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .filter(part => ['text', 'output_text'].includes(part?.type) && typeof part?.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

export function getAIStreamDelta (data, protocol) {
  if (!data || data === '[DONE]') return ''
  const normalizedProtocol = normalizeAIProtocol(protocol)

  if (normalizedProtocol === 'responses') {
    // The official Responses API sends typed events. Some compatible gateways
    // return only the generic delta field, so both shapes are accepted.
    if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') {
      return data.delta
    }
    // output_text.done repeats the full text after deltas. Returning it would
    // duplicate the answer in the UI; the API uses it only as a final fallback.
    if (data.type === 'response.output_text.done') return ''
    if (typeof data.delta === 'string') return data.delta
    if (data.type === 'response.output_text.delta' && typeof data.text === 'string') return data.text
  }

  const chatDelta = data?.choices?.[0]?.delta?.content
  if (typeof chatDelta === 'string') return chatDelta
  if (Array.isArray(chatDelta)) {
    return chatDelta
      .filter(part => ['text', 'output_text'].includes(part?.type) && typeof part?.text === 'string')
      .map(part => part.text)
      .join('')
  }

  if (data?.choices?.[0]?.text && typeof data.choices[0].text === 'string') {
    return data.choices[0].text
  }
  return ''
}
