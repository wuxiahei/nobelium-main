import { clearAdminSessionCookie } from '@/lib/server/admin-auth.mjs'
import { AdminRequestError, assertSameOriginRequest, sendAdminError } from '@/lib/server/admin-api.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      throw new AdminRequestError('Method not allowed.', 405)
    }
    assertSameOriginRequest(req)
    res.setHeader('Set-Cookie', clearAdminSessionCookie())
    return res.status(200).json({ ok: true })
  } catch (error) {
    return sendAdminError(res, error)
  }
}