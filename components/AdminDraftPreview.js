import { useEffect, useState } from 'react'
import { Monitor, Smartphone, X } from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'

export default function AdminDraftPreview ({ form, onClose }) {
  const [viewport, setViewport] = useState('desktop')

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const tags = String(form.tags || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)

  return (
    <div className="admin-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-preview-title">
      <div className="admin-preview-shell">
        <header className="admin-preview-toolbar">
          <div>
            <p className="ink-eyebrow">Live proof</p>
            <strong id="admin-preview-title">未保存内容预览</strong>
          </div>
          <div className="admin-preview-tools">
            <div className="admin-preview-viewports" role="group" aria-label="预览宽度">
              <button
                type="button"
                className={viewport === 'desktop' ? 'is-active' : ''}
                onClick={() => setViewport('desktop')}
                title="桌面宽度"
              >
                <Monitor className="h-4 w-4" aria-hidden="true" />
                桌面
              </button>
              <button
                type="button"
                className={viewport === 'mobile' ? 'is-active' : ''}
                onClick={() => setViewport('mobile')}
                title="手机宽度"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                手机
              </button>
            </div>
            <button type="button" className="ink-command" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
              关闭
            </button>
          </div>
        </header>

        <div className={'admin-preview-canvas admin-preview-canvas-' + viewport}>
          <article className="admin-preview-page">
            <header className="admin-preview-article-header">
              <p className="admin-preview-kicker">{form.draft ? 'Draft proof' : 'Article proof'} · {form.date || '未设置日期'}</p>
              <h1>{form.title || '未命名文章'}</h1>
              {form.summary && <p className="admin-preview-summary">{form.summary}</p>}
              {tags.length > 0 && (
                <div className="admin-preview-tags">
                  {tags.map(tag => <span key={tag}>{tag}</span>)}
                </div>
              )}
            </header>
            <div className="admin-preview-body">
              {form.content.trim()
                ? <MarkdownRenderer content={form.content} />
                : <p className="admin-preview-empty">正文仍为空。这里展示的是当前编辑器中的即时内容，不会请求服务器。</p>}
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
