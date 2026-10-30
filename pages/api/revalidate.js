import { getAllPosts, getAllTagsFromPosts } from '@/lib/notion'
import { config as BLOG } from '@/lib/server/config'
import {
  buildFullSiteRevalidationPaths,
  getRequestedRevalidationPaths,
  isAuthorizedRevalidationRequest
} from '@/lib/server/revalidate.mjs'

const REVALIDATION_CONCURRENCY = 3

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return res.status(503).json({ error: 'REVALIDATE_SECRET is not configured.' })
  }

  if (!isAuthorizedRevalidationRequest(req.headers.authorization, secret)) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  let requestedPaths
  try {
    requestedPaths = getRequestedRevalidationPaths(req.body)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  let paths
  try {
    if (requestedPaths) {
      paths = requestedPaths
    } else {
      const posts = await getAllPosts({ includePages: true })
      const tagPosts = posts.filter(post => post?.type?.[0] === 'Post')
      const tags = Object.keys(getAllTagsFromPosts(tagPosts))
      paths = buildFullSiteRevalidationPaths({
        posts,
        tags,
        postsPerPage: BLOG.postsPerPage,
        pathPrefix: BLOG.path
      })
    }
  } catch (error) {
    console.error(`[revalidate] Failed to build paths: ${error.message || error}`)
    return res.status(500).json({ error: 'Failed to prepare revalidation paths.' })
  }

  const outcomes = await revalidatePaths(res, paths)
  const revalidated = outcomes.filter(item => item.ok).map(item => item.path)
  const failed = outcomes
    .filter(item => !item.ok)
    .map(item => ({ path: item.path, error: item.error }))

  if (failed.length > 0) {
    return res.status(500).json({
      ok: false,
      mode: requestedPaths ? 'paths' : 'full',
      revalidated,
      failed
    })
  }

  return res.status(200).json({
    ok: true,
    mode: requestedPaths ? 'paths' : 'full',
    revalidated
  })
}

async function revalidatePaths (res, paths) {
  const outcomes = new Array(paths.length)
  let cursor = 0

  async function worker () {
    while (cursor < paths.length) {
      const index = cursor
      cursor += 1
      const path = paths[index]

      try {
        await res.revalidate(path)
        outcomes[index] = { path, ok: true }
      } catch (error) {
        const message = error?.message || String(error)
        console.error(`[revalidate] ${path}: ${message}`)
        outcomes[index] = { path, ok: false, error: message }
      }
    }
  }

  const workerCount = Math.min(REVALIDATION_CONCURRENCY, paths.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return outcomes
}
