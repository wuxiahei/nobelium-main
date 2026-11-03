import { put } from '@vercel/blob'
import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import { createImagePathname, parseImageDataUrl } from '@/lib/server/image-upload.mjs'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
}

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)
    assertSameOriginRequest(req)

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      throw new AdminRequestError('Method not allowed.', 405)
    }

    assertJsonRequest(req)
    const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()
    if (!token) {
      throw new AdminRequestError('图片上传尚未配置：请在 Vercel 设置 BLOB_READ_WRITE_TOKEN。', 503)
    }

    let image
    try {
      image = parseImageDataUrl(req.body?.dataUrl)
    } catch (error) {
      throw new AdminRequestError(error.message, 400)
    }

    let blob
    try {
      blob = await put(
        createImagePathname(req.body?.fileName, image),
        image.buffer,
        {
          access: 'public',
          addRandomSuffix: true,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
          contentType: image.mimeType,
          token
        }
      )
    } catch (error) {
      console.error('[admin] Image upload failed:', error)
      throw new AdminRequestError('图片上传失败，请检查 Vercel Blob 配置后重试。', 502)
    }

    return res.status(201).json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: image.mimeType,
      size: image.size
    })
  } catch (error) {
    return sendAdminError(res, error)
  }
}