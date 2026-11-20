import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Check, Copy, Share2 } from 'lucide-react'
import ActionFeedback from '@/components/ActionFeedback'
import FormattedDate from '@/components/FormattedDate'
import { copyTextToClipboard } from '@/lib/clipboard.mjs'

export default function ArticleActions ({ post }) {
  const [status, setStatus] = useState('idle')
  const updatedAt = post.updatedAt || post.date
  const updatedDateTime = toDateTime(updatedAt)

  useEffect(() => {
    if (status === 'idle') return undefined
    const timeout = window.setTimeout(() => setStatus('idle'), 1800)
    return () => window.clearTimeout(timeout)
  }, [status])

  async function copyLink () {
    const copied = await copyTextToClipboard(window.location.href)
    setStatus(copied ? 'copied' : 'failed')
  }

  async function shareArticle () {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text: post.summary || '', url })
        setStatus('shared')
        return
      } catch (error) {
        if (error?.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  return (
    <footer className="article-actions">
      <p className="article-actions-meta">
        <span>最后整理</span>
        <time dateTime={updatedDateTime || undefined}>
          <FormattedDate date={updatedAt} />
        </time>
      </p>
      <div className="article-actions-buttons">
        <button type="button" onClick={copyLink} className="ink-command">
          {status === 'copied'
            ? <Check className="h-4 w-4" aria-hidden="true" />
            : <Copy className="h-4 w-4" aria-hidden="true" />}
          {status === 'copied' ? '链接已复制' : status === 'failed' ? '复制失败' : '复制链接'}
        </button>
        <button type="button" onClick={shareArticle} className="ink-command">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {status === 'shared' ? '已分享' : '分享文章'}
        </button>
      </div>
      <ActionFeedback state={status === 'failed' ? 'error' : 'success'}>
        {status === 'copied' ? '文章链接已复制' : status === 'failed' ? '复制文章链接失败' : status === 'shared' ? '文章已分享' : ''}
      </ActionFeedback>
    </footer>
  )
}

function toDateTime (value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

ArticleActions.propTypes = {
  post: PropTypes.shape({
    title: PropTypes.string,
    summary: PropTypes.string,
    date: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    updatedAt: PropTypes.string
  }).isRequired
}