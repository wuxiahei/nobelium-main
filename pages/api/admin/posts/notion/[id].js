import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import { revalidateAdminContent } from '@/lib/server/admin-revalidate.mjs'
import { getAdminNotionPost, updateNotionPost } from '@/lib/server/notion-posts.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    requireAdminRequest(req)
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (req.method === 'GET') return res.status(200).json(await getAdminNotionPost(id))
    if (req.method === 'PATCH') {
      assertSameOriginRequest(req)
      assertJsonRequest(req)
      const result = await updateNotionPost(id, req.body)
      const revalidation = await revalidateAdminContent(res, [
        { slug: result.previousSlug, tags: result.previousTags }, result.post
      ])
      return res.status(200).json({ ...result, revalidation })
    }
    res.setHeader('Allow', 'GET, PATCH')
    throw new AdminRequestError('Method not allowed.', 405)
  } catch (error) {
    if (error.changedPosts) await revalidateAdminContent(res, error.changedPosts)
    return sendAdminError(res, error)
  }
}
