import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import {
  activateAdminAIProfile,
  deleteAdminAIProfile,
  getAdminAIConfigView,
  resetAdminAIConfig,
  saveAdminAIProfile
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
      const action = String(req.body?.action || 'save_profile')

      if (action === 'activate_profile') {
        return res.status(200).json(await activateAdminAIProfile(req.body?.profileId))
      }

      if (action === 'delete_profile') {
        return res.status(200).json(await deleteAdminAIProfile(req.body?.profileId))
      }

      if (action === 'save_profile') {
        return res.status(200).json(await saveAdminAIProfile(req.body))
      }

      throw new AdminRequestError('Unsupported AI configuration action.', 400)
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