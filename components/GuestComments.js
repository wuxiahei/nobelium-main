import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'
import ActionFeedback from '@/components/ActionFeedback'

const NICKNAME_STORAGE_KEY = 'nobelium-comment-nickname'
const MAX_CONTENT = 2000
const FALLBACK_COPY = {
  COMMENTS_FORM_TITLE: '写下留言',
  COMMENTS_FORM_HINT: '无需登录，昵称和留言将公开展示。',
  COMMENTS_NICKNAME: '昵称',
  COMMENTS_NICKNAME_PLACEHOLDER: '怎么称呼你？',
  COMMENTS_CONTENT: '留言',
  COMMENTS_CONTENT_PLACEHOLDER: '写下你的想法……',
  COMMENTS_SUBMIT: '发布留言',
  COMMENTS_SUBMITTING: '正在发布……',
  COMMENTS_EMPTY: '还没有留言，来写第一条吧。',
  COMMENTS_LOAD_ERROR: '留言加载失败。',
  COMMENTS_SUBMIT_ERROR: '留言提交失败，请稍后重试。',
  COMMENTS_SUCCESS: '留言已发布。',
  COMMENTS_COUNT: '条留言'
}

export default function GuestComments (props) {
  return <CommentThread key={props.pageId} {...props} />
}

function CommentThread ({ pageId, pageTitle, pageUrl }) {
  const BLOG = useConfig()
  const locale = useLocale()
  const copy = { ...FALLBACK_COPY, ...(locale?.POST || {}) }
  const [comments, setComments] = useState([])
  const [nickname, setNickname] = useState('')
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [highlightedId, setHighlightedId] = useState('')
  const editorRef = useRef(null)
  const formRef = useRef(null)
  const loadController = useRef(null)
  const submitController = useRef(null)
  const submittedComments = useRef(new Map())
  const draftKey = 'nobelium-comment-draft:' + pageId
  const replyingTo = comments.find(comment => comment.id === replyTo)

  useEffect(() => {
    try {
      setNickname(window.localStorage.getItem(NICKNAME_STORAGE_KEY) || '')
      const draft = JSON.parse(window.localStorage.getItem(draftKey) || 'null')
      if (draft && typeof draft.content === 'string') {
        setContent(draft.content.slice(0, MAX_CONTENT))
        setReplyTo(typeof draft.replyTo === 'string' ? draft.replyTo : '')
        if (typeof draft.nickname === 'string') setNickname(draft.nickname.slice(0, 24))
        setDraftStatus('已恢复本机未发送的留言')
      }
    } catch {
      setDraftStatus('当前浏览器无法恢复留言草稿')
    }
  }, [draftKey])

  const loadComments = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setLoadingError('')
    try {
      const response = await fetch(`/api/comments?pageId=${encodeURIComponent(pageId)}`, {
        cache: 'no-store', signal: controller.signal
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || '留言加载失败，请重试。')
      if (controller.signal.aborted) return
      const merged = new Map((Array.isArray(payload.comments) ? payload.comments : []).map(comment => [comment.id, comment]))
      submittedComments.current.forEach((comment, id) => merged.set(id, comment))
      setComments([...merged.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
    } catch (error) {
      if (!controller.signal.aborted) setLoadingError(error.message || '留言加载失败，请重试。')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    loadComments()
    return () => {
      loadController.current?.abort()
      submitController.current?.abort()
    }
  }, [loadComments])

  useEffect(() => {
    if (!highlightedId) return
    const node = document.getElementById('comment-' + highlightedId)
    node?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
    node?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setHighlightedId(''), 5000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  function saveDraft (nextContent, nextReplyTo = replyTo, nextNickname = nickname) {
    try {
      if (nextContent || nextReplyTo) {
        window.localStorage.setItem(draftKey, JSON.stringify({ content: nextContent, replyTo: nextReplyTo, nickname: nextNickname }))
        setDraftStatus('未发送内容已暂存在本机')
      } else {
        window.localStorage.removeItem(draftKey)
        setDraftStatus('')
      }
    } catch {
      setDraftStatus('本机暂存不可用，请保留当前页面')
    }
  }

  function chooseReply (comment) {
    setReplyTo(comment.id)
    saveDraft(content, comment.id)
    formRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
    editorRef.current?.focus({ preventScroll: true })
  }

  async function handleSubmit (event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSubmitError('')
    setSuccess('')
    const controller = new AbortController()
    submitController.current = controller
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ pageId, pageTitle, pageUrl, nickname, content, website, replyTo })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || copy.COMMENTS_SUBMIT_ERROR)
      if (!payload.comment?.id) throw new Error('未收到发布确认，请重新加载留言后确认。输入内容已保留。')
      if (controller.signal.aborted) return
      submittedComments.current.set(payload.comment.id, payload.comment)
      setComments(current => [...current.filter(comment => comment.id !== payload.comment.id), payload.comment])
      setContent('')
      setReplyTo('')
      saveDraft('', '')
      setSuccess(copy.COMMENTS_SUCCESS)
      setHighlightedId(payload.comment.id)
      try {
        const savedNickname = nickname.trim().slice(0, 24)
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, savedNickname)
        setNickname(savedNickname)
      } catch { /* Nickname persistence is optional. */ }
    } catch (error) {
      if (!controller.signal.aborted) setSubmitError(error.message || copy.COMMENTS_SUBMIT_ERROR)
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  return (
    <section aria-label={copy.COMMENTS_FORM_TITLE} className="guest-comments font-normal">
      <form ref={formRef} onSubmit={handleSubmit} className="comment-form">
        <h3 className="text-lg font-semibold">{copy.COMMENTS_FORM_TITLE}</h3>
        <p className="mt-1 mb-5 text-sm text-[var(--ink-muted)]">{copy.COMMENTS_FORM_HINT}</p>
        {replyTo && (
          <div className="comment-reply-context">
            <span>回复 {replyingTo?.nickname || '此前的留言'}</span>
            <button type="button" disabled={submitting} className="ink-command" onClick={() => { setReplyTo(''); saveDraft(content, '') }}>取消回复</button>
          </div>
        )}
        <fieldset disabled={submitting} className="grid gap-4 min-w-0">
          <label className="comment-field" htmlFor="guest-comment-nickname">
            <span>{copy.COMMENTS_NICKNAME}</span>
            <input id="guest-comment-nickname" value={nickname} onChange={event => { setNickname(event.target.value); saveDraft(content, replyTo, event.target.value) }} maxLength={24} required autoComplete="nickname" placeholder={copy.COMMENTS_NICKNAME_PLACEHOLDER} />
          </label>
          <label className="comment-field" htmlFor="guest-comment-content">
            <span>{copy.COMMENTS_CONTENT}</span>
            <textarea ref={editorRef} id="guest-comment-content" value={content} onChange={event => { setContent(event.target.value); saveDraft(event.target.value) }} maxLength={MAX_CONTENT} required rows={5} placeholder={copy.COMMENTS_CONTENT_PLACEHOLDER} aria-describedby="comment-draft-state comment-character-count" />
          </label>
          <div className="comment-input-meta">
            <span id="comment-draft-state">{draftStatus}</span>
            <span id="comment-character-count">{content.length} / {MAX_CONTENT}</span>
          </div>
          <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="guest-comment-website">Website</label>
            <input id="guest-comment-website" value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--ink-muted)]">{loading ? '正在读取留言…' : `${comments.length} ${copy.COMMENTS_COUNT}`}</p>
            <button type="submit" disabled={loading || !content.trim() || !nickname.trim()} className="ink-command ink-command-primary disabled:opacity-60">{submitting ? copy.COMMENTS_SUBMITTING : replyTo ? '发布回复' : copy.COMMENTS_SUBMIT}</button>
          </div>
        </fieldset>
        <ActionFeedback state={submitting ? 'loading' : submitError ? 'error' : 'success'}>{submitting ? copy.COMMENTS_SUBMITTING : submitError || success}</ActionFeedback>
      </form>

      <div className="mt-7" aria-busy={loading}>
        {loading && <CommentSkeleton />}
        {!loading && loadingError && <ActionFeedback state="error" onRetry={loadComments} retryLabel="重新加载留言">{loadingError}</ActionFeedback>}
        {!loading && !loadingError && comments.length === 0 && <p className="comment-empty">{copy.COMMENTS_EMPTY}</p>}
        {comments.length > 0 && (
          <div className="comment-list">
            {comments.map(comment => {
              const parent = comments.find(item => item.id === comment.replyTo)
              return (
                <article key={comment.id} id={'comment-' + comment.id} tabIndex={-1} className={'comment-item' + (highlightedId === comment.id ? ' comment-item-new' : '')}>
                  <span className="comment-avatar" aria-hidden="true">{Array.from(comment.nickname || '?')[0]}</span>
                  <div className="comment-item-body">
                    <header className="comment-item-header">
                      <strong>{comment.nickname}</strong>
                      {comment.isAdmin && <span className="comment-author-badge">博主</span>}
                      <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt, BLOG?.lang)}</time>
                    </header>
                    {comment.replyTo && (
                      parent
                        ? <a className="comment-parent ink-focus" href={'#comment-' + parent.id}>回复 {parent.nickname}：{parent.content.slice(0, 80)}{parent.content.length > 80 ? '…' : ''}</a>
                        : <p className="comment-parent">原留言已不可用</p>
                    )}
                    <p className="comment-text">{comment.content}</p>
                    <button type="button" disabled={submitting} onClick={() => chooseReply(comment)} className="comment-reply-button ink-focus">回复</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function CommentSkeleton () {
  return (
    <div role="status" className="comment-skeleton">
      <span className="sr-only">正在加载留言</span>
      {[0, 1].map(index => <div key={index} className="comment-skeleton-row" aria-hidden="true"><span className="skeleton-avatar" /><div><span className="skeleton-line" /><span className="skeleton-line" /></div></div>)}
    </div>
  )
}

function scrollBehavior () {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function formatCommentDate (value, lang) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang || undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch { return date.toLocaleString() }
}
