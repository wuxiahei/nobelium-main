import { config as BLOG } from '@/lib/server/config'
import { dedupeRevalidationPaths } from '@/lib/server/revalidate.mjs'

const MAX_PAGE_PATHS = 12

export async function revalidateAdminContent (res, posts = []) {
  const prefix = normalizePrefix(BLOG.path)
  const paths = new Set([
    withPrefix(prefix, '/'),
    withPrefix(prefix, '/search')
  ])

  for (const post of posts) {
    if (!post?.slug) continue
    paths.add(withPrefix(prefix, '/' + encodeURIComponent(post.slug)))
    for (const tag of post.tags || []) {
      if (tag) paths.add(withPrefix(prefix, '/tag/' + encodeURIComponent(tag)))
    }
  }

  for (let page = 2; page <= MAX_PAGE_PATHS; page += 1) {
    paths.add(withPrefix(prefix, '/page/' + page))
  }

  const revalidated = []
  const failed = []
  for (const path of dedupeRevalidationPaths([...paths])) {
    try {
      await res.revalidate(path)
      revalidated.push(path)
    } catch (error) {
      failed.push({ path, error: error?.message || String(error) })
    }
  }

  if (failed.length) {
    console.warn('[admin] Some paths could not be revalidated:', failed)
  }

  return { revalidated, failed }
}

function normalizePrefix (value) {
  const prefix = String(value || '').trim().replace(/^\/+|\/+$/g, '')
  return prefix ? '/' + prefix : ''
}

function withPrefix (prefix, path) {
  return path === '/' ? (prefix || '/') : prefix + path
}