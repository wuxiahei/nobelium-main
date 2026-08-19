import api from '@/lib/server/notion-api'
import { fetchBlocksAsRecordMap } from '@/lib/server/notion-official-blocks'
import { getNotionToken } from './env'

const postBlocksCache = new Map()

/**
 * Try the official Notion API first (if NOTION_API_KEY is configured).
 * Fall back to the unofficial notion-client library otherwise.
 */
export async function getPostBlocks (id) {
  const officialToken = getNotionToken()

  const fetchFn = officialToken
    ? () => fetchBlocksAsRecordMap(id, officialToken)
    : () => api.getPage(id)

  if (!shouldUseBuildCache()) {
    return fetchFn()
  }

  if (!postBlocksCache.has(id)) {
    postBlocksCache.set(
      id,
      fetchFn().catch(error => {
        postBlocksCache.delete(id)
        throw error
      })
    )
  }

  return postBlocksCache.get(id)
}

function shouldUseBuildCache () {
  return (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  )
}
