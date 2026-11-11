import { getAdminAuthConfig, getAdminSession } from '@/lib/server/admin-auth.mjs'
import { sendAdminError } from '@/lib/server/admin-api.mjs'
import { isGitHubWriteConfigured } from '@/lib/server/github-posts.mjs'
import { isNotionWriteConfigured } from '@/lib/server/notion-posts.mjs'

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Method not allowed.' })
    }

    const config = getAdminAuthConfig()
    const session = config.configured ? getAdminSession(req) : null
    return res.status(200).json({
      configured: config.configured,
      authenticated: Boolean(session),
      username: session?.username || null,
      writeConfigured: isGitHubWriteConfigured(),
      notionWriteConfigured: isNotionWriteConfigured(),
      setupError: config.configured ? null : config.setupError
    })
  } catch (error) {
    return sendAdminError(res, error)
  }
}