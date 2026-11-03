const SEARCH_TEXT_LIMIT = 8000
const QUERY_SPLIT = /[\s,，。;；:：!?！？/\\|()[\]{}"'“”‘’]+/u

export function cleanMarkdownForSearch (markdown, maxLength = SEARCH_TEXT_LIMIT) {
  const source = String(markdown || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, '$1')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^ {0,3}>\s?/gm, '')
    .replace(/^ {0,3}(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~]+/g, '')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return limitSearchText(source, maxLength)
}

export function recordMapToSearchText (recordMap, maxLength = SEARCH_TEXT_LIMIT) {
  const blocks = recordMap?.block || {}
  const values = Object.entries(blocks)
    .map(([id, record]) => ({ id, value: record?.value }))
    .filter(item => item.value)
  const root = values.find(item => item.value.type === 'page' && Array.isArray(item.value.content))
  const visited = new Set()
  const chunks = []

  function walk (id) {
    if (!id || visited.has(id)) return
    visited.add(id)
    const block = blocks[id]?.value
    if (!block) return

    const text = extractBlockText(block)
    if (text) chunks.push(text)
    for (const childId of block.content || []) walk(childId)
  }

  if (root) {
    walk(root.id)
  }

  for (const item of values) {
    if (visited.has(item.id)) continue
    const text = extractBlockText(item.value)
    if (text) chunks.push(text)
  }

  return limitSearchText(chunks.join(' '), maxLength)
}

export function limitSearchText (text, maxLength = SEARCH_TEXT_LIMIT) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!maxLength || normalized.length <= maxLength) return normalized
  return normalized.slice(0, Math.max(0, maxLength)).trim()
}

export function tokenizeSearchQuery (query) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []

  return [...new Set(
    normalized
      .split(QUERY_SPLIT)
      .map(token => token.trim())
      .filter(Boolean)
  )].slice(0, 8)
}

export function scoreSearchPost (post, query) {
  const normalizedQuery = normalizeSearchText(query)
  const tokens = tokenizeSearchQuery(query)
  if (!tokens.length) return { matched: true, score: 0, snippet: '' }

  const title = normalizeSearchText(post?.title)
  const summary = normalizeSearchText(post?.summary)
  const tags = normalizeSearchText((post?.tags || []).join(' '))
  const body = normalizeSearchText(post?.searchText)
  const allText = [title, tags, summary, body].filter(Boolean).join(' ')

  if (!tokens.every(token => allText.includes(token))) {
    return { matched: false, score: 0, snippet: '' }
  }

  let score = scoreField(title, tokens, normalizedQuery, 10, 16)
  score += scoreField(tags, tokens, normalizedQuery, 6, 9)
  score += scoreField(summary, tokens, normalizedQuery, 4, 7)
  score += scoreField(body, tokens, normalizedQuery, 1, 5)

  const bodyHasMatch = tokens.some(token => body.includes(token))
  return {
    matched: true,
    score,
    snippet: bodyHasMatch ? makeSearchSnippet(body, tokens) : ''
  }
}

export function filterAndScorePosts (posts, query) {
  if (!tokenizeSearchQuery(query).length) {
    return (posts || []).map(post => ({ post, score: 0, snippet: '' }))
  }

  return (posts || [])
    .map(post => ({ post, ...scoreSearchPost(post, query) }))
    .filter(result => result.matched)
    .sort((a, b) => b.score - a.score)
}

export function splitSearchHighlight (text, query) {
  const source = String(text || '')
  const tokens = tokenizeSearchQuery(query).sort((a, b) => b.length - a.length)
  if (!source || !tokens.length) return [{ text: source, match: false }]

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'giu')
  return source
    .split(pattern)
    .filter(segment => segment !== '')
    .map(segment => ({
      text: segment,
      match: tokens.some(token => segment.toLowerCase() === token.toLowerCase())
    }))
}

function extractBlockText (block) {
  const properties = block?.properties || {}
  const chunks = []

  for (const key of ['title', 'caption']) {
    if (properties[key]) chunks.push(flattenRichText(properties[key]))
  }

  for (const [key, value] of Object.entries(properties)) {
    if (/^table(?:Column|_column)/i.test(key)) chunks.push(flattenRichText(value))
  }

  return chunks.filter(Boolean).join(' ')
}

function flattenRichText (value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(flattenRichText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    if (typeof value.plain_text === 'string') return value.plain_text
    if (value.text && typeof value.text.content === 'string') return value.text.content
  }
  return ''
}

function scoreField (field, tokens, fullQuery, tokenWeight, phraseBonus) {
  if (!field) return 0

  let score = 0
  for (const token of tokens) {
    const occurrences = countOccurrences(field, token)
    if (occurrences) score += tokenWeight + Math.min(occurrences - 1, 3)
  }
  if (fullQuery && field.includes(fullQuery)) score += phraseBonus
  return score
}

function countOccurrences (source, token) {
  let count = 0
  let index = 0
  while ((index = source.indexOf(token, index)) !== -1) {
    count += 1
    index += Math.max(1, token.length)
  }
  return count
}

function makeSearchSnippet (body, tokens) {
  const indexes = tokens
    .map(token => body.indexOf(token))
    .filter(index => index >= 0)
  if (!indexes.length) return ''

  const firstIndex = Math.min(...indexes)
  const start = Math.max(0, firstIndex - 52)
  const end = Math.min(body.length, firstIndex + 170)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return prefix + body.slice(start, end).trim() + suffix
}

function normalizeSearchText (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp (value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}