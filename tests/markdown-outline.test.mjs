import assert from 'node:assert/strict'
import test from 'node:test'
import { extractMarkdownHeadings } from '../lib/markdown-outline.mjs'

test('extracts ATX headings with levels, text, and source positions', () => {
  const markdown = '# 开篇\n\n正文\n\n## **第二段**\n### 细节 ###'
  const headings = extractMarkdownHeadings(markdown)

  assert.deepEqual(headings.map(({ level, text }) => ({ level, text })), [
    { level: 1, text: '开篇' },
    { level: 2, text: '第二段' },
    { level: 3, text: '细节' }
  ])
  assert.deepEqual(headings.map(heading => heading.line), [1, 5, 6])
  assert.equal(markdown.slice(headings[1].position, headings[1].position + 2), '##')
})

test('ignores headings inside fenced code blocks', () => {
  const markdown = [
    '# Real heading',
    '```md',
    '# Not a heading',
    '```',
    '~~~',
    '## Still code',
    '~~~',
    '### Another real heading'
  ].join('\n')

  assert.deepEqual(extractMarkdownHeadings(markdown).map(heading => heading.text), [
    'Real heading',
    'Another real heading'
  ])
})

test('handles empty and malformed heading-like lines safely', () => {
  assert.deepEqual(extractMarkdownHeadings('#\n####### too deep\n    # indented code\n#no-space'), [])
  assert.deepEqual(extractMarkdownHeadings(''), [])
})