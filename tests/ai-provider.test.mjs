import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_AI_USER_AGENT,
  buildAIProviderRequest,
  getAIResponseContent,
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

test('AI protocol aliases normalize to supported provider protocols', () => {
  assert.equal(normalizeAIProtocol('chat'), 'chat_completions')
  assert.equal(normalizeAIProtocol('response'), 'responses')
  assert.equal(normalizeAIProtocol(''), 'chat_completions')
  assert.throws(() => normalizeAIProtocol('graphql'), /chat_completions 或 responses/)
  assert.equal(normalizeAIUserAgent('  codex   test/1.0  '), 'codex test/1.0')
  assert.throws(() => normalizeAIUserAgent('x'.repeat(513)), /512/)
})

test('Chat Completions requests include the Codex user agent', () => {
  const request = buildAIProviderRequest(providerConfig, {
    messages: [{ role: 'user', content: '你好' }],
    temperature: 0.4
  }, '系统提示')

  assert.equal(request.url, 'https://api.example.com/v1/chat/completions')
  assert.equal(request.init.headers['User-Agent'], DEFAULT_AI_USER_AGENT)
  const body = JSON.parse(request.init.body)
  assert.deepEqual(body.messages, [
    { role: 'system', content: '系统提示' },
    { role: 'user', content: '你好' }
  ])
  assert.equal(body.max_tokens, 2048)
})

test('Responses requests use instructions, input and max_output_tokens', () => {
  const request = buildAIProviderRequest({
    ...providerConfig,
    protocol: 'responses'
  }, {
    messages: [
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' }
    ],
    temperature: 0.3
  }, '系统提示')

  assert.equal(request.url, 'https://api.example.com/v1/responses')
  assert.equal(request.init.headers['User-Agent'], DEFAULT_AI_USER_AGENT)
  const body = JSON.parse(request.init.body)
  assert.equal(body.instructions, '系统提示')
  assert.deepEqual(body.input, [
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '第二问' }
  ])
  assert.equal(body.max_output_tokens, 2048)
  assert.equal(body.store, false)
})

test('Responses output text is extracted from standard and wrapped shapes', () => {
  assert.equal(getAIResponseContent({
    output_text: '直接返回'
  }, 'responses'), '直接返回')

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
