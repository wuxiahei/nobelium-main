import { del, list } from '@vercel/blob'
import {
  AdminRequestError,
  assertJsonRequest,
  assertSameOriginRequest,
  requireAdminRequest,
  sendAdminError
} from '@/lib/server/admin-api.mjs'
import { listAdminGitHubPostDocuments } from '@/lib/server/github-posts.mjs'
import {
  MANAGED_IMAGE_PREFIX,
  extractManagedImagePathnames,
  normalizeManagedPathname
} from '@/lib/image-lifecycle.mjs'

const MAX_LIST_PAGES = 10

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    requireAdminRequest(req)
    const token = getBlobToken()

    if (req.method === 'GET') {
      const [blobs, documents] = await Promise.all([
        listManagedBlobs(token),
        listAdminGitHubPostDocuments()
      ])
      const images = blobs.map(blob => {
        const references = documents
          .filter(document => extractManagedImagePathnames(document.content).includes(blob.pathname))
          .map(document => ({
            number: document.post.githubIssueNumber,
            title: document.post.title
          }))

        return {
          url: blob.url,
          pathname: blob.pathname,
          size: Number(blob.size) || 0,
          uploadedAt: blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() : String(blob.uploadedAt || ''),
          references
        }
      })

      return res.status(200).json({ images })
    }

    if (req.method === 'DELETE') {
      assertSameOriginRequest(req)
      assertJsonRequest(req)
      const pathname = normalizeManagedPathname(req.body?.pathname)
      if (!pathname) {
        throw new AdminRequestError('只能删除诺贝尔图片库中的有效图片。', 400)
      }

      const [blobs, documents] = await Promise.all([
        listManagedBlobs(token),
        listAdminGitHubPostDocuments()
      ])
      if (!blobs.some(blob => blob.pathname === pathname)) {
        throw new AdminRequestError('图片不存在，或已经被删除。', 404)
      }

      const referencedBy = documents.find(document => extractManagedImagePathnames(document.content).includes(pathname))
      if (referencedBy) {
        throw new AdminRequestError(
          `这张图片仍被《${referencedBy.post.title}》引用，请先从文章中移除并保存后再删除。`,
          409
        )
      }

      try {
        await del(pathname, { token })
      } catch (error) {
        console.error('[admin] Image delete failed:', error)
        throw new AdminRequestError('图片删除失败，请稍后重试。', 502)
      }

      return res.status(200).json({ deleted: pathname })
    }

    res.setHeader('Allow', 'GET, DELETE')
    throw new AdminRequestError('Method not allowed.', 405)
  } catch (error) {
    return sendAdminError(res, error)
  }
}

function getBlobToken () {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()
  if (!token) {
    throw new AdminRequestError('图片库尚未配置：请在 Vercel 设置 BLOB_READ_WRITE_TOKEN。', 503)
  }
  return token
}

async function listManagedBlobs (token) {
  const blobs = []
  let cursor

  try {
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      const result = await list({
        prefix: MANAGED_IMAGE_PREFIX,
        limit: 1000,
        cursor,
        token
      })
      blobs.push(...result.blobs.filter(blob => normalizeManagedPathname(blob.pathname)))
      if (!result.hasMore || !result.cursor) break
      cursor = result.cursor
    }
  } catch (error) {
    console.error('[admin] Image list failed:', error)
    throw new AdminRequestError('图片库加载失败，请检查 Vercel Blob 配置。', 502)
  }

  return blobs
}