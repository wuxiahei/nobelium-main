import { getPublicAIConfig } from '@/lib/server/ai-config.mjs'

export default async function handler (req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const publicConfig = await getPublicAIConfig()
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    return res.status(200).json(publicConfig)
  } catch (error) {
    console.error(`[ai-config] Public configuration unavailable: ${error.message}`)
    return res.status(503).json({
      enabled: false,
      model: '',
      displayName: 'AI 助手',
      storage: 'browser-only'
    })
  }
}