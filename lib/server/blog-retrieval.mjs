import { config as BLOG } from './config'
import { getAllPosts } from '../notion/getAllPosts'
import { buildBlogContext, tokenizeBlogQuery } from '../ai/blog-context.mjs'

const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_KEY = '__elyAIBlogContextCache'
const globalCache = globalThis[CACHE_KEY] || { posts: null, expiresAt: 0, pending: null }
globalThis[CACHE_KEY] = globalCache

export async function retrieveBlogContext (query, options = {}) {
  const normalizedQuery = String(query || '').trim()
  if (!tokenizeBlogQuery(normalizedQuery).length) return { context: '', sources: [] }

  const posts = await loadBlogPosts(options)
  return buildBlogContext(posts, normalizedQuery, {
    path: BLOG.path || '',
    maxSources: options.maxSources,
    maxContextChars: options.maxContextChars
  })
}

export function getBlogRetrievalQuery (messages) {
  const userMessages = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'user' && String(message.content || '').trim())
    .map(message => String(message.content || '').trim())

  const current = userMessages[userMessages.length - 1] || ''
  if (!current || current.length >= 36 || userMessages.length < 2) return current

  const previous = userMessages[userMessages.length - 2]
  return previous ? previous + '\n' + current : current
}

async function loadBlogPosts ({ force = false } = {}) {
  const now = Date.now()
  if (!force && globalCache.posts && globalCache.expiresAt > now) return globalCache.posts
  if (!force && globalCache.pending) return globalCache.pending

  globalCache.pending = getAllPosts({ includePages: false, includeSearchText: true })
    .then(posts => {
      globalCache.posts = posts.map(post => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        summary: post.summary,
        tags: post.tags,
        date: post.date,
        updatedAt: post.updatedAt,
        source: post.source,
        searchText: post.searchText
      }))
      globalCache.expiresAt = Date.now() + CACHE_TTL_MS
      return globalCache.posts
    })
    .catch(error => {
      globalCache.expiresAt = Date.now() + 60 * 1000
      throw error
    })
    .finally(() => {
      globalCache.pending = null
    })

  return globalCache.pending
}
