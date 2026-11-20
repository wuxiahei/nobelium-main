import api from '@/lib/server/notion-api'
import { fetchNotionSearchText } from '@/lib/server/notion-search-text.mjs'
import { recordMapToSearchText } from '@/lib/search-index.mjs'
import { getNotionToken } from './env'

const postSearchTextCache = new Map()

/**
 * Build a compact search index without fetching the complete render tree.
 * The fallback client returns the entire page in one request, so its record
 * map can be converted directly.
 */
export async function getPostSearchText (id) {
  const officialToken = getNotionToken()
  const fetchFn = officialToken
    ? () => fetchNotionSearchText(id, officialToken)
    : async () => recordMapToSearchText(await api.getPage(id))

  if (!shouldUseBuildCache()) {
    return fetchFn()
  }

  if (!postSearchTextCache.has(id)) {
    postSearchTextCache.set(
      id,
      fetchFn().catch(error => {
        postSearchTextCache.delete(id)
        throw error
      })
    )
  }

  return postSearchTextCache.get(id)
}

function shouldUseBuildCache () {
  return (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  )
}
