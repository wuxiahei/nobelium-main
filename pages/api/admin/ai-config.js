import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import {
  getAdminAIConfigView,
  resetAdminAIConfig,
  saveAdminAIConfig
} from '@/lib/server/ai-config.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)

    if (req.method === 'GET') {
      return res.status(200).json(await getAdminAIConfigView())
    }

    if (req.method === 'POST') {
      assertSameOriginRequest(req)
      assertJsonRequest(req)
      return res.status(200).json(await saveAdminAIConfig(req.body))
    }

    if (req.method === 'DELETE') {
      assertSameOriginRequest(req)
      return res.status(200).json(await resetAdminAIConfig())
    }

    res.setHeader('Allow', 'GET, POST, DELETE')
    throw new AdminRequestError('Method not allowed.', 405)
  } catch (error) {
    return sendAdminError(res, error)
  }
}