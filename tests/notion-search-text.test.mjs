import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractOfficialBlockText,
  fetchNotionSearchText
} from '../lib/server/notion-search-text.mjs'

test('builds a Notion search index from shallow block children only', async () => {
  const originalFetch = globalThis.fetch
  const originalInterval = process.env.NOTION_REQUEST_INTERVAL_MS
  const calls = []

  process.env.NOTION_REQUEST_INTERVAL_MS = '0'
  globalThis.fetch = async input => {
    calls.push(String(input))
    return jsonResponse({
      results: [
        block('heading', 'heading_2', {
          heading_2: { rich_text: [richText('部署指南')] }
        }),
        block('paragraph', 'paragraph', {
          has_children: true,
          paragraph: { rich_text: [richText('Vercel 缓存刷新与增量更新。')] }
        }),
        block('table', 'table', {
          has_children: true,
          table: { table_width: 2 }
        })
      ],
      has_more: false,
      next_cursor: null
    })
  }

  try {
    const text = await fetchNotionSearchText('page-id', 'token', {
      maxRequests: 1
    })

    assert.equal(text, '部署指南 Vercel 缓存刷新与增量更新。')
    assert.equal(calls.length, 1)
    assert.match(calls[0], /\/blocks\/page-id\/children/)
    assert.doesNotMatch(calls[0], /paragraph\/children/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalInterval === undefined) delete process.env.NOTION_REQUEST_INTERVAL_MS
    else process.env.NOTION_REQUEST_INTERVAL_MS = originalInterval
  }
})

test('extracts table cells and captions from official Notion blocks', () => {
  assert.equal(
    extractOfficialBlockText(block('row', 'table_row', {
      table_row: { cells: [[richText('名称')], [richText('用途')]] }
    })),
    '名称 用途'
  )
  assert.equal(
    extractOfficialBlockText(block('image', 'image', {
      image: { caption: [richText('架构图')], type: 'external', external: { url: 'https://example.com/a.png' } }
    })),
    '架构图'
  )
})

test('respects the search text length limit', async () => {
  const originalFetch = globalThis.fetch
  const originalInterval = process.env.NOTION_REQUEST_INTERVAL_MS

  process.env.NOTION_REQUEST_INTERVAL_MS = '0'
  globalThis.fetch = async () => jsonResponse({
    results: [block('paragraph', 'paragraph', {
      paragraph: { rich_text: [richText('很长的正文内容')] }
    })],
    has_more: false,
    next_cursor: null
  })

  try {
    assert.equal(
      await fetchNotionSearchText('page-id', 'token', { maxLength: 4 }),
      '很长的正'
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalInterval === undefined) delete process.env.NOTION_REQUEST_INTERVAL_MS
    else process.env.NOTION_REQUEST_INTERVAL_MS = originalInterval
  }
})

function jsonResponse (body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

function block (id, type, values) {
  return {
    id,
    type,
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-01-01T00:00:00.000Z',
    has_children: false,
    ...values
  }
}

function richText (plainText) {
  return {
    type: 'text',
    plain_text: plainText,
    text: { content: plainText }
  }
}
