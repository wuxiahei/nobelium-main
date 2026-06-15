import api from '@/lib/server/notion-api'

const postBlocksCache = new Map()

export async function getPostBlocks (id) {
  if (!shouldUseBuildCache()) {
    return api.getPage(id)
  }

  if (!postBlocksCache.has(id)) {
    postBlocksCache.set(
      id,
      api.getPage(id).catch(error => {
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
