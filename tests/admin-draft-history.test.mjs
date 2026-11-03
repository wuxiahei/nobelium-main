import assert from 'node:assert/strict'
import test from 'node:test'
import { appendDraftSnapshot, normalizeDraftSnapshots } from '../lib/admin-draft-history.mjs'

test('keeps the latest five distinct local draft versions', () => {
  let history = []
  for (let index = 1; index <= 7; index += 1) {
    history = appendDraftSnapshot(history, { title: '版本 ' + index }, index * 1000)
  }

  assert.equal(history.length, 5)
  assert.equal(history[0].form.title, '版本 7')
  assert.equal(history[4].form.title, '版本 3')
})

test('updates the timestamp when the same draft is saved again', () => {
  let history = appendDraftSnapshot([], { title: '相同内容' }, 1000)
  history = appendDraftSnapshot(history, { title: '相同内容' }, 2000)

  assert.equal(history.length, 1)
  assert.equal(history[0].updatedAt, 2000)
})

test('normalizes legacy or malformed history entries', () => {
  const normalized = normalizeDraftSnapshots([
    { updatedAt: 'bad', form: { title: '无效' } },
    { updatedAt: 1000, form: { title: '有效' } }
  ])

  assert.deepEqual(normalized, [{ updatedAt: 1000, form: { title: '有效' } }])
})
