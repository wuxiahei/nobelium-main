import { useCallback, useEffect, useMemo, useState } from 'react'
import ActionFeedback from '@/components/ActionFeedback'
import ContentImage from '@/components/ContentImage'
import { Copy, ImagePlus, RefreshCw, Trash2, X } from 'lucide-react'
import { extractManagedImagePathnames } from '@/lib/image-lifecycle.mjs'

export default function AdminImageLibrary ({ content, onInsert, onClose }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState('')
  const [copied, setCopied] = useState('')
  const currentReferences = useMemo(() => new Set(extractManagedImagePathnames(content)), [content])

  const loadImages = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestJson('/api/admin/images')
      setImages(Array.isArray(data.images) ? data.images : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  async function copyUrl (image) {
    try {
      await copyText(image.url)
      setCopied(image.pathname)
      window.setTimeout(() => setCopied(current => current === image.pathname ? '' : current), 1600)
    } catch {
      setError('复制失败，请手动打开图片地址。')
    }
  }

  async function deleteImage (image) {
    const referencedByCurrent = currentReferences.has(image.pathname)
    if (referencedByCurrent || image.references.length) {
      setError('这张图片仍被文章引用，不能删除。')
      return
    }
    const confirmed = window.confirm('确认从图片库永久删除这张图片？\n\n建议先确认它没有被 Notion 页面或其他外部内容使用。')
    if (!confirmed) return

    setDeleting(image.pathname)
    setError('')
    try {
      await requestJson('/api/admin/images', {
        method: 'DELETE',
        body: JSON.stringify({ pathname: image.pathname })
      })
      setImages(current => current.filter(item => item.pathname !== image.pathname))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeleting('')
    }
  }

  return (
    <section className="admin-image-library" aria-label="已上传图片">
      <div className="admin-image-library-header">
        <div>
          <strong>图片素材库</strong>
          <p>仅显示诺贝尔图片库中的文件。删除前会检查 GitHub 文章引用，不会自动清理。</p>
        </div>
        <div className="admin-image-library-actions">
          <button type="button" className="ink-command" onClick={loadImages} disabled={loading}>
            <RefreshCw className={'h-4 w-4' + (loading ? ' animate-spin' : '')} aria-hidden="true" />
            刷新
          </button>
          <button type="button" className="ink-command" onClick={onClose} aria-label="关闭图片库">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ActionFeedback state="error" onRetry={loadImages} retryLabel="重新加载图片库">{error}</ActionFeedback>

      <ActionFeedback state="loading">{loading ? '正在读取图片库…' : ''}</ActionFeedback>
      <ActionFeedback>{copied ? '图片网址已复制。' : ''}</ActionFeedback>
      {!loading && !error && images.length === 0 && (
        <p className="admin-image-library-empty">图片库还是空的。上传图片后，它会留在这里供其他文章复用。</p>
      )}

      {!loading && images.length > 0 && (
        <div className="admin-image-library-grid">
          {images.map(image => {
            const referencedByCurrent = currentReferences.has(image.pathname)
            const referenceCount = image.references.length + (referencedByCurrent && !image.references.some(item => item.number) ? 1 : 0)
            const cannotDelete = referencedByCurrent || image.references.length > 0
            return (
              <article className="admin-image-card" key={image.pathname}>
                <div className="admin-image-card-preview">
                  <ContentImage src={image.url} alt={getFileName(image.pathname)} />
                  <span className={cannotDelete ? 'is-used' : 'is-orphan'}>
                    {cannotDelete ? `引用 ${referenceCount}` : '未被引用'}
                  </span>
                </div>
                <div className="admin-image-card-body">
                  <p className="admin-image-card-name" title={image.pathname}>{getFileName(image.pathname)}</p>
                  <p className="admin-image-card-meta">{formatBytes(image.size)} · {formatDate(image.uploadedAt)}</p>
                  {image.references.length > 0 && (
                    <p className="admin-image-card-refs" title={image.references.map(item => item.title).join('\n')}>
                      {image.references.map(item => '#' + item.number).join(' · ')}
                    </p>
                  )}
                  <div className="admin-image-card-actions">
                    <button type="button" onClick={() => onInsert(image)} title="插入当前光标位置">
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />插入
                    </button>
                    <button type="button" onClick={() => copyUrl(image)}>
                      <Copy className="h-4 w-4" aria-hidden="true" />{copied === image.pathname ? '已复制' : '网址'}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={cannotDelete || deleting === image.pathname}
                      onClick={() => deleteImage(image)}
                      title={cannotDelete ? '文章仍引用这张图片' : '永久删除图片'}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />{deleting === image.pathname ? '删除中' : '删除'}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

async function copyText (value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy failed')
}

function getFileName (pathname) {
  return String(pathname || '').split('/').pop() || 'image'
}

function formatBytes (value) {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return '大小未知'
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / 1024 / 1024).toFixed(1) + ' MB'
}

function formatDate (value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function requestJson (url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || '请求失败，请稍后重试。')
    error.status = response.status
    throw error
  }
  return data
}