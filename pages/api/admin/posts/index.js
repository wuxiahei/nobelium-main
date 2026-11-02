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
  listAdminGitHubPosts
} from '@/lib/server/github-posts.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)

    if (req.method === 'GET') {
      const posts = await listAdminGitHubPosts()
      return res.status(200).json({ posts })
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