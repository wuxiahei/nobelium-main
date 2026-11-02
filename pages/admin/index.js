import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Container from '@/components/Container'

const EMPTY_FORM = {
  title: '',
  slug: '',
  summary: '',
  tags: '',
  date: new Date().toISOString().slice(0, 10),
  content: '',
  draft: true
}

export default function AdminPage () {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [posts, setPosts] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [currentNumber, setCurrentNumber] = useState(null)
  const [currentPost, setCurrentPost] = useState(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true)
    try {
      const data = await requestJson('/api/admin/posts')
      setPosts(Array.isArray(data.posts) ? data.posts : [])
    } catch (requestError) {
      if (requestError.status === 401) {
        setSession(current => current ? { ...current, authenticated: false } : current)
      } else {
        setError(requestError.message)
      }
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    requestJson('/api/admin/session')
      .then(data => {
        if (!active) return
        setSession(data)
        if (data.authenticated) loadPosts()
      })
      .catch(requestError => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setCheckingSession(false)
      })
    return () => { active = false }
  }, [loadPosts])

  function updateField (field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setMessage('')
    setError('')
  }

  function startNewPost () {
    setCurrentNumber(null)
    setCurrentPost(null)
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    setError('')
    setMessage('')
  }

  async function openPost (number) {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const data = await requestJson('/api/admin/posts/' + number)
      const post = data.post
      setCurrentNumber(post.githubIssueNumber)
      setCurrentPost(post)
      setForm({
        title: post.title || '',
        slug: post.slug || '',
        summary: post.summary || '',
        tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
        date: formatDateInput(post.date),
        content: data.content || '',
        draft: Boolean(post.draft)
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function login (event) {
    event.preventDefault()
    setLoggingIn(true)
    setError('')
    try {
      const data = await requestJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      const nextSession = await requestJson('/api/admin/session')
      setSession(nextSession)
      setPassword('')
      await loadPosts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoggingIn(false)
    }
  }

  async function logout () {
    try {
      await requestJson('/api/admin/logout', { method: 'POST', body: '{}' })
    } catch (requestError) {
      console.warn(requestError)
    }
    setSession(current => current ? { ...current, authenticated: false, username: null } : current)
    setPosts([])
    setCurrentNumber(null)
    setCurrentPost(null)
    setForm(EMPTY_FORM)
  }

  async function savePost (draft) {
    setSaving(true)
    setError('')
    setMessage('')

    if (!session?.writeConfigured) {
      setError('写文章尚未配置：请设置 CONTENT_GITHUB_REPO 和 CONTENT_GITHUB_TOKEN。')
      setSaving(false)
      return
    }
    if (!form.title.trim()) {
      setError('请输入文章标题。')
      setSaving(false)
      return
    }
    if (!draft && !form.content.trim()) {
      setError('发布文章前需要填写正文。')
      setSaving(false)
      return
    }

    const payload = {
      ...form,
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      draft
    }
    const url = currentNumber ? '/api/admin/posts/' + currentNumber : '/api/admin/posts'

    try {
      const data = await requestJson(url, {
        method: currentNumber ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      })
      const post = data.post
      setCurrentNumber(post.githubIssueNumber)
      setCurrentPost(post)
      setForm(current => ({
        ...current,
        title: post.title || '',
        slug: post.slug || '',
        summary: post.summary || '',
        tags: (post.tags || []).join(', '),
        date: formatDateInput(post.date),
        draft: Boolean(post.draft)
      }))
      setMessage(draft ? '草稿已保存到 GitHub Issue。' : '文章已发布，页面缓存已触发更新。')
      await loadPosts()
    } catch (requestError) {
      if (requestError.status === 401) {
        setSession(current => current ? { ...current, authenticated: false } : current)
      }
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container title="写作后台 · 管理员" description="Nobelium 管理员写作后台" headerMeta="管理员">
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ink-line)] pb-5">
            <div>
              <p className="ink-eyebrow mb-2">Admin</p>
              <h1 className="text-3xl font-semibold text-[var(--ink-main)]">写作后台</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                文章保存在 GitHub Issue；Notion 原有内容继续正常显示。
              </p>
            </div>
            {session?.authenticated && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[var(--ink-muted)]">{session.username}</span>
                <button type="button" className="ink-command" onClick={logout}>退出登录</button>
              </div>
            )}
          </div>

          {checkingSession && <StatusCard>正在检查管理员会话……</StatusCard>}

          {!checkingSession && !session?.configured && (
            <StatusCard tone="warning">
              <strong>管理员账户尚未配置。</strong>
              <span className="mt-2 block">请在 Vercel 环境变量中设置 ADMIN_USERNAME、ADMIN_PASSWORD（或 ADMIN_PASSWORD_HASH）和至少 32 位 ADMIN_SESSION_SECRET。</span>
            </StatusCard>
          )}

          {!checkingSession && session?.configured && !session.authenticated && (
            <div className="mx-auto max-w-md rounded-sm border border-[var(--ink-line)] bg-[var(--ink-surface)] p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[var(--ink-main)]">管理员登录</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">只有管理员账号可以创建和修改文章。</p>
              <form className="mt-6 grid gap-4" onSubmit={login}>
                <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                  <span>管理员账号</span>
                  <input
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    autoComplete="username"
                    required
                    className="h-11 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                  <span>密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-11 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]"
                  />
                </label>
                {error && <InlineError>{error}</InlineError>}
                <button type="submit" disabled={loggingIn} className="ink-command ink-command-primary disabled:opacity-60">
                  {loggingIn ? '正在登录……' : '登录'}
                </button>
              </form>
            </div>
          )}

          {session?.authenticated && (
            <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
              <aside className="rounded-sm border border-[var(--ink-line)] bg-[var(--ink-surface)] p-4">
                <button type="button" className="ink-command ink-command-primary w-full" onClick={startNewPost}>新建文章</button>
                <div className="mt-5 flex items-center justify-between text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  <span>GitHub 文章</span>
                  {loadingPosts && <span>加载中</span>}
                </div>
                <div className="mt-3 grid gap-1">
                  {!loadingPosts && posts.length === 0 && (
                    <p className="py-4 text-sm leading-6 text-[var(--ink-muted)]">还没有 GitHub 文章。新建后会创建一个带 nobelium-post 标签的 Issue。</p>
                  )}
                  {posts.map(post => (
                    <button
                      key={post.githubIssueNumber}
                      type="button"
                      onClick={() => openPost(post.githubIssueNumber)}
                      className={`rounded-sm px-3 py-3 text-left transition hover:bg-[var(--ink-accent-soft)] ${currentNumber === post.githubIssueNumber ? 'bg-[var(--ink-accent-soft)]' : ''}`}
                    >
                      <span className="block text-sm font-semibold leading-5 text-[var(--ink-main)]">{post.title}</span>
                      <span className="mt-1 block text-xs text-[var(--ink-muted)]">{post.draft ? '草稿' : '已发布'} · #{post.githubIssueNumber}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="min-w-0 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-surface)] p-5 sm:p-7">
                {!session.writeConfigured && (
                  <InlineError>写文章还需要在 Vercel 配置 CONTENT_GITHUB_REPO 和具有 Issues 读写权限的 CONTENT_GITHUB_TOKEN。</InlineError>
                )}

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="ink-eyebrow mb-1">{currentNumber ? '# ' + currentNumber : 'New post'}</p>
                    <h2 className="text-2xl font-semibold text-[var(--ink-main)]">{currentNumber ? '编辑文章' : '新建文章'}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentPost?.githubIssueUrl && (
                      <a href={currentPost.githubIssueUrl} target="_blank" rel="noreferrer" className="ink-command">GitHub Issue</a>
                    )}
                    {currentPost && !currentPost.draft && currentPost.slug && (
                      <a href={'/' + currentPost.slug} target="_blank" rel="noreferrer" className="ink-command">查看文章</a>
                    )}
                  </div>
                </div>

                <div className="grid gap-5">
                  <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                    <span>标题</span>
                    <input value={form.title} onChange={event => updateField('title', event.target.value)} maxLength={180} required className="h-12 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]" />
                  </label>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                      <span>日期</span>
                      <input type="date" value={form.date} onChange={event => updateField('date', event.target.value)} className="h-11 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]" />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                      <span>Slug（可留空自动生成）</span>
                      <input value={form.slug} onChange={event => updateField('slug', event.target.value)} placeholder="my-post" className="h-11 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]" />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                    <span>摘要（可留空自动提取）</span>
                    <textarea value={form.summary} onChange={event => updateField('summary', event.target.value)} maxLength={300} rows={3} className="resize-y rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 py-2 text-base leading-7 outline-none focus:border-[var(--ink-accent)]" />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                    <span>标签（英文逗号分隔）</span>
                    <input value={form.tags} onChange={event => updateField('tags', event.target.value)} placeholder="Next.js, Vercel" className="h-11 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-base outline-none focus:border-[var(--ink-accent)]" />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                    <span>正文（Markdown）</span>
                    <textarea value={form.content} onChange={event => updateField('content', event.target.value)} maxLength={60000} rows={24} spellCheck="false" className="resize-y rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 py-3 font-mono text-sm leading-7 outline-none focus:border-[var(--ink-accent)]" />
                  </label>

                  {error && <InlineError>{error}</InlineError>}
                  {message && <p className="rounded-sm border border-[var(--ink-accent)] bg-[var(--ink-accent-soft)] px-3 py-2 text-sm text-[var(--ink-accent)]" role="status">{message}</p>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink-line)] pt-5">
                    <p className="text-xs leading-5 text-[var(--ink-muted)]">支持 GFM、代码块、表格、图片和 KaTeX 数学公式。</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={saving || !session.writeConfigured} onClick={() => savePost(true)} className="ink-command disabled:opacity-60">{saving ? '保存中……' : '保存为草稿'}</button>
                      <button type="button" disabled={saving || !session.writeConfigured} onClick={() => savePost(false)} className="ink-command ink-command-primary disabled:opacity-60">{saving ? '保存中……' : currentPost?.draft ? '发布文章' : '更新并发布'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </Container>
    </>
  )
}

function StatusCard ({ children, tone = 'default' }) {
  const toneClass = tone === 'warning'
    ? 'border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] text-[var(--ink-seal)]'
    : 'border-[var(--ink-line)] bg-[var(--ink-surface)] text-[var(--ink-muted)]'
  return <div className={'mx-auto max-w-2xl rounded-sm border px-5 py-5 text-sm leading-7 ' + toneClass}>{children}</div>
}

function InlineError ({ children }) {
  return <p className="rounded-sm border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-3 py-2 text-sm leading-6 text-[var(--ink-seal)]" role="alert">{children}</p>
}

function formatDateInput (value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10)
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