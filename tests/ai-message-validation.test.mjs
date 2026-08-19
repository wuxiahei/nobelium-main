import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_CHAT_MESSAGES,
  MAX_MESSAGE_LENGTH,
  normalizeChatRequest
} from '../lib/ai/messages.mjs'

test('normalizes safe chat input and clamps temperature', () => {
  const request = normalizeChatRequest({
    messages: [{ role: 'user', content: '  解释 $E=mc^2$  ' }],
    systemPrompt: '  简洁回答  ',
    articleContext: '  上下文  ',
    temperature: 3
  })

  assert.deepEqual(request.messages, [{ role: 'user', content: '解释 $E=mc^2$' }])
  assert.equal(request.systemPrompt, '简洁回答')
  assert.equal(request.articleContext, '上下文')
  assert.equal(request.temperature, 1)
})

test('rejects invalid roles and requires a final user message', () => {
  assert.throws(
    () => normalizeChatRequest({ messages: [{ role: 'system', content: 'hidden' }] }),
    /invalid message role/
  )
  assert.throws(
    () => normalizeChatRequest({ messages: [{ role: 'assistant', content: 'done' }] }),
    /last message must be from the user/
  )
})

test('limits message count and individual message length', () => {
  const messages = Array.from({ length: MAX_CHAT_MESSAGES + 4 }, (_, index) => ({
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: String(index)
  }))
  const request = normalizeChatRequest({ messages })

  assert.equal(request.messages.length, MAX_CHAT_MESSAGES)

  const longRequest = normalizeChatRequest({
    messages: [{ role: 'user', content: 'x'.repeat(MAX_MESSAGE_LENGTH + 20) }]
  })
  assert.equal(longRequest.messages[0].content.length, MAX_MESSAGE_LENGTH)
})
