import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_AI_USER_AGENT,
  buildAIProviderRequest,
  getAIResponseContent,
  getAIStreamDelta,
  normalizeAIProtocol,
  normalizeAIUserAgent
} from '../lib/ai/provider.mjs'

const providerConfig = {
  apiKey: 'sk-test',
  baseURL: 'https://api.example.com/v1',
  model: 'example-model',
  protocol: 'chat_completions',
  userAgent: DEFAULT_AI_USER_AGENT,
  maxOutputTokens: 2048
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII='

test('AI protocol aliases normalize to supported provider protocols', () => {
  assert.equal(normalizeAIProtocol('chat'), 'chat_completions')
  assert.equal(normalizeAIProtocol('response'), 'responses')
  assert.equal(normalizeAIProtocol(''), 'chat_completions')
  assert.throws(() => normalizeAIProtocol('graphql'), /chat_completions 或 responses/)
  assert.equal(normalizeAIUserAgent('  codex   test/1.0  '), 'codex test/1.0')
  assert.throws(() => normalizeAIUserAgent('x'.repeat(513)), /512/)
})

test('Chat Completions requests stream by default and include the Codex user agent', () => {
  const request = buildAIProviderRequest(providerConfig, {
    messages: [{ role: 'user', content: '你好', attachments: [] }],
    temperature: 0.4
  }, '系统提示')

  assert.equal(request.url, 'https://api.example.com/v1/chat/completions')
  assert.equal(request.init.headers['User-Agent'], DEFAULT_AI_USER_AGENT)
  assert.equal(request.init.headers.Accept, 'text/event-stream')
  const body = JSON.parse(request.init.body)
  assert.deepEqual(body.messages, [
    { role: 'system', content: '系统提示' },
    { role: 'user', content: '你好' }
  ])
  assert.equal(body.max_tokens, 2048)
  assert.equal(body.stream, true)

  const nonStreaming = buildAIProviderRequest(providerConfig, {
    messages: [{ role: 'user', content: '你好', attachments: [] }],
    temperature: 0.4
  }, '', { stream: false })
  assert.equal(nonStreaming.init.headers.Accept, 'application/json')
  assert.equal(JSON.parse(nonStreaming.init.body).stream, false)
})

test('Responses requests use instructions, input and max_output_tokens', () => {
  const request = buildAIProviderRequest({
    ...providerConfig,
    protocol: 'responses'
  }, {
    messages: [
      { role: 'user', content: '第一问', attachments: [] },
      { role: 'assistant', content: '第一答', attachments: [] },
      { role: 'user', content: '第二问', attachments: [] }
    ],
    temperature: 0.3
  }, '系统提示')

  assert.equal(request.url, 'https://api.example.com/v1/responses')
  assert.equal(request.init.headers['User-Agent'], DEFAULT_AI_USER_AGENT)
  assert.equal(request.init.headers.Accept, 'text/event-stream')
  const body = JSON.parse(request.init.body)
  assert.equal(body.instructions, '系统提示')
  assert.deepEqual(body.input, [
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '第二问' }
  ])
  assert.equal(body.max_output_tokens, 2048)
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
})

test('both protocols serialize images and text attachments without exposing file metadata', () => {
  const message = {
    role: 'user',
    content: '比较这两张图',
    attachments: [
      {
        type: 'text',
        name: 'notes.md',
        mimeType: 'text/markdown',
        content: '# 笔记',
        size: 4
      },
      {
        type: 'image',
        name: 'pixel.png',
        mimeType: 'image/png',
        dataUrl: TINY_PNG,
        size: 68
      }
    ]
  }

  const chatRequest = buildAIProviderRequest(providerConfig, {
    messages: [message],
    temperature: 0.4
  }, '系统提示', { stream: false })
  const chatBody = JSON.parse(chatRequest.init.body)
  assert.deepEqual(chatBody.messages[1].content, [
    { type: 'text', text: '比较这两张图\n\n附件「notes.md」内容：\n\n# 笔记' },
    { type: 'image_url', image_url: { url: TINY_PNG } }
  ])

  const responsesRequest = buildAIProviderRequest({
    ...providerConfig,
    protocol: 'responses'
  }, {
    messages: [message],
    temperature: 0.4
  }, '系统提示', { stream: false })
  const responsesBody = JSON.parse(responsesRequest.init.body)
  assert.deepEqual(responsesBody.input[0].content, [
    { type: 'input_text', text: '比较这两张图\n\n附件「notes.md」内容：\n\n# 笔记' },
    { type: 'input_image', image_url: TINY_PNG }
  ])
})

test('Responses output text is extracted from standard and wrapped shapes', () => {
  assert.equal(getAIResponseContent({ output_text: '直接返回' }, 'responses'), '直接返回')

  assert.equal(getAIResponseContent({
    output: [{
      type: 'message',
      content: [
        { type: 'output_text', text: '第一段' },
        { type: 'output_text', text: '第二段' }
      ]
    }]
  }, 'responses'), '第一段\n第二段')
})

test('Chat Completions response parsing remains supported', () => {
  assert.equal(getAIResponseContent({
    choices: [{
      message: {
        content: [{ type: 'text', text: '兼容内容' }]
      }
    }]
  }, 'chat_completions'), '兼容内容')
})

test('stream deltas are parsed for Chat Completions and Responses protocols', () => {
  assert.equal(getAIStreamDelta({
    choices: [{ delta: { content: '你' } }]
  }, 'chat_completions'), '你')

  assert.equal(getAIStreamDelta({
    choices: [{ delta: { content: [{ type: 'text', text: '好' }] } }]
  }, 'chat_completions'), '好')

  assert.equal(getAIStreamDelta({
    type: 'response.output_text.delta',
    delta: '站内'
  }, 'responses'), '站内')

  assert.equal(getAIStreamDelta({
    type: 'response.output_text.done',
    text: '完整内容'
  }, 'responses'), '')
  assert.equal(getAIStreamDelta({ type: 'response.created' }, 'responses'), '')
  assert.equal(getAIStreamDelta('[DONE]', 'responses'), '')
})
