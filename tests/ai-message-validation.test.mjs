import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_IMAGE_ATTACHMENTS,
  MAX_TOTAL_TEXT_LENGTH,
  normalizeChatRequest
} from '../lib/ai/messages.mjs'

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII='

function imageAttachment (overrides = {}) {
  return {
    type: 'image',
    name: 'pixel.png',
    mimeType: 'image/png',
    dataUrl: TINY_PNG,
    ...overrides
  }
}

test('normalizes safe chat input, enables blog retrieval by default and clamps temperature', () => {
  const request = normalizeChatRequest({
    messages: [{ role: 'user', content: '  解释 $E=mc^2$  ' }],
    systemPrompt: '  简洁回答  ',
    articleContext: '  上下文  ',
    temperature: 1.2
  })

  assert.deepEqual(request.messages, [{ role: 'user', content: '解释 $E=mc^2$', attachments: [] }])
  assert.equal(request.systemPrompt, '简洁回答')
  assert.equal(request.articleContext, '上下文')
  assert.equal(request.useBlogContext, true)
  assert.equal(request.temperature, 1)

  const disabled = normalizeChatRequest({
    messages: [{ role: 'user', content: '不查站内文章' }],
    useBlogContext: false
  })
  assert.equal(disabled.useBlogContext, false)
})

test('accepts image, text and attachment-only user messages', () => {
  const request = normalizeChatRequest({
    messages: [{
      role: 'user',
      content: '  看这两份资料  ',
      attachments: [
        imageAttachment(),
        {
          type: 'text',
          name: 'notes.md',
          mimeType: 'text/markdown',
          content: '  # 笔记\n正文  '
        }
      ]
    }]
  })

  assert.equal(request.messages[0].content, '看这两份资料')
  assert.equal(request.messages[0].attachments.length, 2)
  assert.equal(request.messages[0].attachments[0].mimeType, 'image/png')
  assert.ok(request.messages[0].attachments[0].size > 0)
  assert.equal(request.messages[0].attachments[1].content, '# 笔记\n正文')
  assert.equal(request.messages[0].attachments[1].mimeType, 'text/markdown')

  const attachmentOnly = normalizeChatRequest({
    messages: [{ role: 'user', content: '', attachments: [imageAttachment()] }]
  })
  assert.equal(attachmentOnly.messages[0].content, '')
})

test('rejects invalid roles and requires a final non-empty user message', () => {
  assert.throws(
    () => normalizeChatRequest({ messages: [{ role: 'system', content: 'hidden' }] }),
    /invalid message role/
  )
  assert.throws(
    () => normalizeChatRequest({ messages: [{ role: 'assistant', content: 'done' }] }),
    /last message must be from the user/
  )
  assert.throws(
    () => normalizeChatRequest({ messages: [{ role: 'user', content: '   ' }] }),
    /empty message/
  )
})

test('limits message count and individual message length', () => {
  const messages = Array.from({ length: MAX_CHAT_MESSAGES + 4 }, (_, index) => ({
    role: index === MAX_CHAT_MESSAGES + 3 ? 'user' : (index % 2 === 0 ? 'assistant' : 'user'),
    content: String(index)
  }))
  const request = normalizeChatRequest({ messages })

  assert.equal(request.messages.length, MAX_CHAT_MESSAGES)

  const longRequest = normalizeChatRequest({
    messages: [{ role: 'user', content: 'x'.repeat(MAX_MESSAGE_LENGTH + 20) }]
  })
  assert.equal(longRequest.messages[0].content.length, MAX_MESSAGE_LENGTH)
})

test('enforces attachment count, role and per-file text and image limits', () => {
  assert.throws(
    () => normalizeChatRequest({
      messages: [{
        role: 'user',
        content: 'too many',
        attachments: Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () => imageAttachment())
      }]
    }),
    /每条消息最多/
  )

  assert.throws(
    () => normalizeChatRequest({
      messages: [{ role: 'assistant', content: 'reply', attachments: [imageAttachment()] }]
    }),
    /only allowed on user messages/
  )

  assert.throws(
    () => normalizeChatRequest({
      messages: [{
        role: 'user',
        content: '',
        attachments: [imageAttachment({ mimeType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })]
      }]
    }),
    /unsupported image type/
  )

  assert.throws(
    () => normalizeChatRequest({
      messages: [{
        role: 'user',
        content: '',
        attachments: [imageAttachment({ dataUrl: 'data:image/jpeg;base64,iVBORw0KGgo=' })]
      }]
    }),
    /not a valid data URL/
  )

  assert.throws(
    () => normalizeChatRequest({
      messages: [{
        role: 'user',
        content: '',
        attachments: [{
          type: 'text',
          name: 'payload.exe',
          mimeType: 'application/octet-stream',
          content: 'unsafe'
        }]
      }]
    }),
    /unsupported text file type/
  )
})

test('rejects conversations with too much text or too many images', () => {
  const textLength = Math.floor(MAX_TOTAL_TEXT_LENGTH / 2) + 1
  assert.throws(
    () => normalizeChatRequest({
      messages: [
        { role: 'user', content: '', attachments: [{ type: 'text', name: 'a.txt', mimeType: 'text/plain', content: 'a'.repeat(textLength) }] },
        { role: 'user', content: '', attachments: [{ type: 'text', name: 'b.txt', mimeType: 'text/plain', content: 'b'.repeat(textLength) }] }
      ]
    }),
    /conversation is too long/
  )

  assert.throws(
    () => normalizeChatRequest({
      messages: Array.from({ length: MAX_TOTAL_IMAGE_ATTACHMENTS + 1 }, () => ({
        role: 'user',
        content: '',
        attachments: [imageAttachment()]
      }))
    }),
    /最多发送 4 张图片/
  )
})
