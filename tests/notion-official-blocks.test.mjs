import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotionRenderer } from 'react-notion-x'

async function loadConverter () {
  const [source, dependencySource] = await Promise.all([
    readFile(new URL('../lib/server/notion-official-blocks.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/notion-fetch.mjs', import.meta.url), 'utf8')
  ])
  const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependencySource).toString('base64')}`
  const resolvedSource = source.replace('./notion-fetch.mjs', dependencyUrl)
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(resolvedSource).toString('base64')}`
  return import(moduleUrl)
}

function jsonResponse (body) {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

test('official API blocks render toggle content, tables, links, and rich text', async () => {
  const originalFetch = globalThis.fetch
  const originalLog = console.log
  const unsupportedBlocks = []

  const blocksByParent = {
    page: [
      block('toggle-1', 'toggle', {
        has_children: true,
        toggle: {
          rich_text: [richText('OpenAI Agent SDK', {
            bold: true,
            href: 'https://example.com/agent'
          })]
        }
      }),
      block('table-1', 'table', {
        has_children: true,
        table: {
          table_width: 2,
          has_column_header: true,
          has_row_header: false
        }
      }),
      block('preview-1', 'link_preview', {
        link_preview: { url: 'https://example.com/reference' }
      })
    ],
    'toggle-1': [
      block('paragraph-1', 'paragraph', {
        paragraph: { rich_text: [richText('Nested content is visible')] }
      })
    ],
    'table-1': [
      block('row-1', 'table_row', {
        table_row: {
          cells: [
            [richText('Name', { bold: true })],
            [richText('Purpose')]
          ]
        }
      }),
      block('row-2', 'table_row', {
        table_row: {
          cells: [
            [richText('Taste-Skill')],
            [richText('Improve UI')]
          ]
        }
      })
    ]
  }

  globalThis.fetch = async input => {
    const url = new URL(String(input))

    if (url.pathname === '/v1/pages/page') {
      return jsonResponse({
        id: 'page',
        created_time: '2026-01-01T00:00:00.000Z',
        last_edited_time: '2026-01-01T00:00:00.000Z',
        parent: { type: 'workspace' },
        properties: {
          title: { type: 'title', title: [richText('Test page')] }
        }
      })
    }

    const parentId = url.pathname.match(/\/v1\/blocks\/(.+)\/children/)?.[1]
    if (parentId && blocksByParent[parentId]) {
      return jsonResponse({
        results: blocksByParent[parentId],
        has_more: false,
        next_cursor: null
      })
    }

    return { ok: false, status: 404, text: async () => 'Not found' }
  }

  console.log = (...args) => {
    if (String(args[0]).startsWith('Unsupported block type')) {
      unsupportedBlocks.push(args[0])
    }
  }

  try {
    const { fetchBlocksAsRecordMap } = await loadConverter()
    const recordMap = await fetchBlocksAsRecordMap('page', 'test-token')
    const html = renderToStaticMarkup(
      React.createElement(NotionRenderer, { recordMap, fullPage: false })
    )

    assert.match(html, /OpenAI Agent SDK/)
    assert.match(html, /Nested content is visible/)
    assert.match(html, /Taste-Skill/)
    assert.match(html, /Improve UI/)
    assert.match(html, /https:\/\/example.com\/reference/)
    assert.match(html, /<b>OpenAI Agent SDK<\/b>/)
    assert.match(html, /href="https:\/\/example.com\/agent"/)
    assert.deepEqual(unsupportedBlocks, [])
  } finally {
    globalThis.fetch = originalFetch
    console.log = originalLog
  }
})

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

function richText (plainText, options = {}) {
  return {
    type: 'text',
    plain_text: plainText,
    href: options.href || null,
    text: {
      content: plainText,
      link: options.href ? { url: options.href } : null
    },
    annotations: {
      bold: Boolean(options.bold),
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default'
    }
  }
}
