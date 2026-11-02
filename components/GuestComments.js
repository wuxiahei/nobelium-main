import { useEffect, useState } from 'react'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'

const NICKNAME_STORAGE_KEY = 'nobelium-comment-nickname'

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
  COMMENTS_LOAD_ERROR: '留言加载失败，请刷新后重试。',
  COMMENTS_SUBMIT_ERROR: '留言提交失败，请稍后重试。',
  COMMENTS_SUCCESS: '留言已发布。',
  COMMENTS_COUNT: '条留言'
}

export default function GuestComments ({ pageId, pageTitle, pageUrl }) {
  const BLOG = useConfig()
  const locale = useLocale()
  const copy = { ...FALLBACK_COPY, ...(locale?.POST || {}) }
  const [comments, setComments] = useState([])
  const [nickname, setNickname] = useState('')
  const [content, setContent] = useState('')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    try {
      const savedNickname = window.localStorage.getItem(NICKNAME_STORAGE_KEY)
      if (savedNickname) setNickname(savedNickname)
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load () {
      setLoading(true)
      setLoadingError('')
      try {
        const response = await fetch(`/api/comments?pageId=${encodeURIComponent(pageId)}`, {
          cache: 'no-store',
          signal: controller.signal
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || copy.COMMENTS_LOAD_ERROR)
        if (active) setComments(Array.isArray(payload.comments) ? payload.comments : [])
      } catch (error) {
        if (active && error.name !== 'AbortError') setLoadingError(copy.COMMENTS_LOAD_ERROR)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [pageId, copy.COMMENTS_LOAD_ERROR])

  async function handleSubmit (event) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setSubmitError('')
    setSuccess('')

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          pageTitle,
          pageUrl,
          nickname,
          content,
          website
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || copy.COMMENTS_SUBMIT_ERROR)

      if (payload.comment) {
        setComments(current => [...current, payload.comment])
      }
      setContent('')
      setSuccess(copy.COMMENTS_SUCCESS)

      try {
        const savedNickname = nickname.trim().slice(0, 24)
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, savedNickname)
        setNickname(savedNickname)
      } catch {
        // Saving the nickname is optional.
      }
    } catch (error) {
      setSubmitError(error.message || copy.COMMENTS_SUBMIT_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-label={copy.COMMENTS_FORM_TITLE} className="font-normal">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[var(--ink-line)] bg-[var(--ink-surface)] p-5 sm:p-6"
      >
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-[var(--ink-main)]">{copy.COMMENTS_FORM_TITLE}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{copy.COMMENTS_FORM_HINT}</p>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]" htmlFor="guest-comment-nickname">
            <span>{copy.COMMENTS_NICKNAME}</span>
            <input
              id="guest-comment-nickname"
              type="text"
              value={nickname}
              onChange={event => setNickname(event.target.value)}
              maxLength={24}
              required
              autoComplete="nickname"
              placeholder={copy.COMMENTS_NICKNAME_PLACEHOLDER}
              className="h-11 rounded-lg border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base font-normal text-[var(--ink-main)] outline-none transition-colors placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-accent)]"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]" htmlFor="guest-comment-content">
            <span>{copy.COMMENTS_CONTENT}</span>
            <textarea
              id="guest-comment-content"
              value={content}
              onChange={event => setContent(event.target.value)}
              maxLength={2000}
              required
              rows={6}
              placeholder={copy.COMMENTS_CONTENT_PLACEHOLDER}
              className="resize-y rounded-lg border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 py-3 text-base font-normal leading-7 text-[var(--ink-main)] outline-none transition-colors placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-accent)]"
            />
          </label>

          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="guest-comment-website">Website</label>
            <input
              id="guest-comment-website"
              type="text"
              value={website}
              onChange={event => setWebsite(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[var(--ink-muted)]">
              {comments.length} {copy.COMMENTS_COUNT}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="ink-command ink-command-primary min-w-28 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? copy.COMMENTS_SUBMITTING : copy.COMMENTS_SUBMIT}
            </button>
          </div>
        </div>

        {submitError && (
          <p className="mt-4 rounded-lg border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-3 py-2 text-sm leading-6 text-[var(--ink-seal)]" role="alert">
            {submitError}
          </p>
        )}
        {success && (
          <p className="mt-4 text-sm leading-6 text-[var(--ink-accent)]" role="status">
            {success}
          </p>
        )}
      </form>

      <div className="mt-7" aria-live="polite">
        {loading && (
          <div className="rounded-xl border border-dashed border-[var(--ink-line)] px-4 py-6 text-sm text-[var(--ink-muted)]">
            {locale?.POST?.COMMENTS_LOADING || '正在加载留言……'}
          </div>
        )}

        {!loading && loadingError && (
          <div className="rounded-xl border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-4 py-4 text-sm leading-6 text-[var(--ink-seal)]" role="alert">
            {loadingError}
          </div>
        )}

        {!loading && !loadingError && comments.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--ink-line)] px-4 py-6 text-sm text-[var(--ink-muted)]">
            {copy.COMMENTS_EMPTY}
          </p>
        )}

        {!loading && !loadingError && comments.length > 0 && (
          <div className="divide-y divide-[var(--ink-line)] border-y border-[var(--ink-line)]">
            {comments.map(comment => (
              <article key={comment.id} className="py-5">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm font-semibold text-[var(--ink-main)]">{comment.nickname}</strong>
                  <time className="text-xs text-[var(--ink-muted)]" dateTime={comment.createdAt}>
                    {formatCommentDate(comment.createdAt, BLOG?.lang)}
                  </time>
                </header>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--ink-main)]">
                  {comment.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function formatCommentDate (value, lang) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}