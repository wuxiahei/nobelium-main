import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import { revalidateAdminContent } from '@/lib/server/admin-revalidate.mjs'
import {
  getAdminGitHubPost,
  updateGitHubPost
} from '@/lib/server/github-posts.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)
    const rawNumber = Array.isArray(req.query.number) ? req.query.number[0] : req.query.number

    if (req.method === 'GET') {
      const result = await getAdminGitHubPost(rawNumber)
      return res.status(200).json(result)
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      assertSameOriginRequest(req)
      assertJsonRequest(req)
      const result = await updateGitHubPost(rawNumber, req.body)
      const revalidation = await revalidateAdminContent(res, [
        { slug: result.previousSlug, tags: [] },
        result.post
      ])
      return res.status(200).json({ ...result, revalidation })
    }

    res.setHeader('Allow', 'GET, PATCH, PUT')
    throw new AdminRequestError('Method not allowed.', 405)
  } catch (error) {
    return sendAdminError(res, error)
  }
}