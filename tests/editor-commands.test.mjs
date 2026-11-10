import test from 'node:test'
import assert from 'node:assert/strict'
import { getSlashCommand, filterEditorCommands } from '../lib/editor-commands.mjs'

test('slash commands only trigger at a line start, outside fenced code and selections', () => {
  assert.deepEqual(getSlashCommand('/h2', 3), { start: 0, end: 3, query: 'h2' })
  assert.deepEqual(getSlashCommand('正文\n  /代码', 8), { start: 5, end: 8, query: '代码' })
  for (const text of ['https://example.com/', '文字 /', '```js\n/', '~~~~\n/']) assert.equal(getSlashCommand(text, text.length), null)
  assert.equal(getSlashCommand('/h2', 0, 3), null)
  assert.equal(getSlashCommand('```\ncode\n```\n/', 15)?.query, '')
})

test('commands support Chinese names and English shortcuts', () => {
  assert.equal(filterEditorCommands('h2')[0].value, 'h2')
  assert.equal(filterEditorCommands('图片')[0].value, 'image')
  assert.equal(filterEditorCommands('toggle')[0].value, 'fold')
  assert.equal(filterEditorCommands('no-match').length, 0)
})
