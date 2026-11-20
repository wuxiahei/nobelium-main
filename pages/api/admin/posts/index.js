import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import { revalidateAdminContent } from '@/lib/server/admin-revalidate.mjs'
import {
  createGitHubPost,
  isGitHubWriteConfigured,
  listAdminGitHubPosts
} from '@/lib/server/github-posts.mjs'

import { listAdminNotionPosts } from '@/lib/server/notion-posts.mjs'
import { sortPosts } from '@/lib/post-order.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)

    if (req.method === 'GET') {
      const results = await Promise.allSettled([
        isGitHubWriteConfigured() ? listAdminGitHubPosts() : Promise.resolve([]),
        listAdminNotionPosts()
      ])
      const posts = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
      const warnings = results.flatMap((result, index) => result.status === 'rejected'
        ? [(index === 0 ? 'GitHub' : 'Notion') + ' 文章暂时无法读取：' + result.reason.message]
        : [])
      return res.status(200).json({ posts: sortPosts(posts, 'updatedAt'), warnings })
    }

    if (req.method === 'POST') {
      assertSameOriginRequest(req)
      assertJsonRequest(req)
      const post = await createGitHubPost(req.body)
      const revalidation = await revalidateAdminContent(res, [post])
      return res.status(201).json({ post, revalidation })
    }

    res.setHeader('Allow', 'GET, POST')
    throw new AdminRequestError('Method not allowed.', 405)
  } catch (error) {
    return sendAdminError(res, error)
  }
}