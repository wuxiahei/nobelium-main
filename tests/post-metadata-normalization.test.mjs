import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePostMetadata } from '../lib/notion/normalizePostMetadata.mjs'

test('trims route metadata received from Notion', () => {
  const post = normalizePostMetadata({
    title: ' 计算机科学\u3000',
    slug: '\u00a0Computer Science ',
    summary: ' Notes about CS. ',
    tags: [' Computer ', '\u3000AI\u3000', ''],
    type: [' Post '],
    status: [' Published ']
  })

  assert.deepEqual(post, {
    title: '计算机科学',
    slug: 'Computer Science',
    summary: 'Notes about CS.',
    tags: ['Computer', 'AI'],
    type: ['Post'],
    status: ['Published']
  })
})
