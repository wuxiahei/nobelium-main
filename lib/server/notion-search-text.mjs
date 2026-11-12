import { NOTION_API_BASE, notionFetch } from './notion-fetch.mjs'
import { limitSearchText } from '../search-index.mjs'

const DEFAULT_MAX_REQUESTS = 1
const DEFAULT_MAX_LENGTH = 8000

/**
 * Fetch a compact search index for a Notion page.
 *
 * Search only needs readable text, not a renderable block tree. Keeping this
 * request shallow avoids the N+1 recursive block crawl that made large sites
 * exceed Next.js' static generation deadline.
 *
 * @param {string} pageId
 * @param {string} token
 * @param {{ maxRequests?: number, maxLength?: number, notionVersion?: string }} [options]
 */
export async function fetchNotionSearchText (pageId, token, options = {}) {
  const notionVersion =
    options.notionVersion ||
    process.env.NOTION_VERSION ||
    '2022-06-28'
  const maxRequests = parsePositiveInteger(
    options.maxRequests ?? process.env.NOTION_SEARCH_MAX_REQUESTS_PER_POST,
    DEFAULT_MAX_REQUESTS
  )
  const maxLength = parsePositiveInteger(options.maxLength, DEFAULT_MAX_LENGTH)
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': notionVersion,
    'Content-Type': 'application/json'
  }
  const chunks = []
  let cursor = null
  let requestCount = 0

  do {
    const url = new URL(`${NOTION_API_BASE}/blocks/${pageId}/children`)
    url.searchParams.set('page_size', '100')
    if (cursor) url.searchParams.set('start_cursor', cursor)

    const response = await notionFetch(url.toString(), { headers })
    requestCount += 1

    if (!response.ok) {
      const message = await response.text()
      throw new Error(
        `Notion search index failed for ${pageId}: ${response.status} ${message}`
      )
    }

    const data = await response.json()
    for (const block of data.results || []) {
      const text = extractOfficialBlockText(block)
      if (text) chunks.push(text)
    }

    if (limitSearchText(chunks.join(' '), maxLength).length >= maxLength) break
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor && requestCount < maxRequests)

  return limitSearchText(chunks.join(' '), maxLength)
}

/**
 * Convert an official Notion block into plain searchable text.
 * @param {object} block
 */
export function extractOfficialBlockText (block = {}) {
  const value = block?.[block?.type] || {}
  const chunks = []

  if (Array.isArray(value.rich_text)) {
    chunks.push(extractRichText(value.rich_text))
  }
  if (typeof value.expression === 'string') {
    chunks.push(value.expression)
  }
  if (typeof value.title === 'string') {
    chunks.push(value.title)
  }
  if (typeof value.name === 'string') {
    chunks.push(value.name)
  }
  if (typeof value.url === 'string') {
    chunks.push(value.url)
  }
  if (Array.isArray(value.caption)) {
    chunks.push(extractRichText(value.caption))
  }
  if (Array.isArray(value.cells)) {
    chunks.push(
      ...value.cells.map(cell =>
        Array.isArray(cell) ? extractRichText(cell) : String(cell || '')
      )
    )
  }

  return chunks.filter(Boolean).join(' ')
}

function extractRichText (richText = []) {
  return richText
    .map(item => {
      if (typeof item === 'string') return item
      return (
        item?.plain_text ||
        item?.text?.content ||
        item?.equation?.expression ||
        ''
      )
    })
    .filter(Boolean)
    .join('')
}

function parsePositiveInteger (value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
