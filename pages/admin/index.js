import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Container from '@/components/Container'
import AdminMarkdownEditor from '@/components/AdminMarkdownEditor'

const DRAFT_STORAGE_PREFIX = 'nobelium:admin-draft:'
const AUTOSAVE_DELAY_MS = 1500
const EMPTY_FORM = createEmptyForm()

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
  const [showPassword, setShowPassword] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [draftSaveState, setDraftSaveState] = useState('idle')
  const [lastAutosavedAt, setLastAutosavedAt] = useState(null)
  const [recovery, setRecovery] = useState(null)

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
        if (data.authenticated) {
          loadPosts()
          const candidate = findRecovery(null, EMPTY_FORM)
          if (candidate) setRecovery(candidate)
        }
      })
      .catch(requestError => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setCheckingSession(false)
      })
    return () => { active = false }
  }, [loadPosts])

  useEffect(() => {
    if (!dirty) return
    if (!hasDraftContent(form)) {
      removeLocalDraft(currentNumber)
      setDraftSaveState('idle')
      setLastAutosavedAt(null)
      return
    }
    if (recovery || saving) return

    setDraftSaveState('pending')
    const timer = window.setTimeout(() => {
      try {
        writeLocalDraft(currentNumber, form)
        setLastAutosavedAt(Date.now())
        setDraftSaveState('saved')
      } catch (storageError) {
        console.error(storageError)
        setDraftSaveState('error')
      }
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [form, dirty, recovery, saving, currentNumber])

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  function updateField (field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setDirty(true)
    setDraftSaveState('pending')
    setMessage('')
    setError('')
  }

  function startNewPost () {
    const nextForm = createEmptyForm()
    setCurrentNumber(null)
    setCurrentPost(null)
    setForm(nextForm)
    setError('')
    setMessage('')
    setDirty(false)
    setDraftSaveState('idle')
    setLastAutosavedAt(null)
    setRecovery(findRecovery(null, nextForm))
  }

  async function openPost (number) {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const data = await requestJson('/api/admin/posts/' + number)
      const post = data.post
      const nextForm = {
        title: post.title || '',
        slug: post.slug || '',
        summary: post.summary || '',
        tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
        date: formatDateInput(post.date),
        content: data.content || '',
        draft: Boolean(post.draft)
      }
      setCurrentNumber(post.githubIssueNumber)
      setCurrentPost(post)
      setForm(nextForm)
      setDirty(false)
      setDraftSaveState('idle')
      setLastAutosavedAt(null)
      setRecovery(findRecovery(post.githubIssueNumber, nextForm))
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
      await requestJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      const nextSession = await requestJson('/api/admin/session')
      setSession(nextSession)
      setPassword('')
      await loadPosts()
      const nextForm = createEmptyForm()
      setCurrentNumber(null)
      setCurrentPost(null)
      setForm(nextForm)
      setDirty(false)
      setDraftSaveState('idle')
      setRecovery(findRecovery(null, nextForm))
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
    setForm(createEmptyForm())
    setDirty(false)
    setDraftSaveState('idle')
    setLastAutosavedAt(null)
    setRecovery(null)
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
    const previousNumber = currentNumber
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
      removeLocalDraft(null)
      removeLocalDraft(previousNumber)
      removeLocalDraft(post.githubIssueNumber)
      setDirty(false)
      setDraftSaveState('idle')
      setLastAutosavedAt(null)
      setRecovery(null)
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

  function restoreRecovery () {
    if (!recovery) return
    const nextForm = normalizeDraftForm(recovery.form)
    if (!nextForm) {
      setError('本地草稿内容无效，无法恢复。')
      return
    }
    setForm(nextForm)
    setCurrentNumber(recovery.number)
    if (recovery.number === null) setCurrentPost(null)
    setDirty(true)
    setDraftSaveState('saved')
    setLastAutosavedAt(recovery.updatedAt)
    setRecovery(null)
    setError('')
    setMessage('已恢复本地草稿。确认内容后，请手动保存为草稿或发布。')
  }

  function discardRecovery () {
    if (!recovery) return
    removeLocalDraft(recovery.number)
    setRecovery(null)
    setDirty(false)
    setDraftSaveState('idle')
    setLastAutosavedAt(null)
    setMessage('已丢弃本地草稿备份。')
  }

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container title="写作后台 · 管理员" description="Nobelium 管理员写作后台" headerMeta="管理员" robots="noindex, nofollow">
        <section className="w-full pb-16">
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
              <span className="mt-2 block">请在 Vercel 环境变量中设置 ADMIN_USERNAME、ADMIN_PASSWORD_HASH、ADMIN_SESSION_SECRET（至少 32 位）。不建议使用明文 ADMIN_PASSWORD。</span>
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
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                      className="h-11 w-full rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 pr-16 text-base outline-none focus:border-[var(--ink-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(current => !current)}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-main)]"
                    >
                      {showPassword ? '隐藏' : '显示'}
                    </button>
                  </div>
                </label>
                {error && <InlineError>{error}</InlineError>}
                <button type="submit" disabled={loggingIn} className="ink-command ink-command-primary disabled:opacity-60">
                  {loggingIn ? '正在登录……' : '登录'}
                </button>
              </form>
            </div>
          )}

          {session?.authenticated && (
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="rounded-sm border border-[var(--ink-line)] bg-[var(--ink-surface)] p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
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
                    {currentNumber && currentPost?.draft && (
                      <a href={'/preview/' + currentNumber} target="_blank" rel="noreferrer" className="ink-command">预览已保存草稿</a>
                    )}
                    {currentPost && !currentPost.draft && currentPost.slug && (
                      <a href={'/' + currentPost.slug} target="_blank" rel="noreferrer" className="ink-command">查看文章</a>
                    )}
                  </div>
                </div>

                {recovery && (
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-4 py-3 text-sm text-[var(--ink-seal)]">
                    <div>
                      <strong className="block">发现上次未提交的本地草稿</strong>
                      <span className="mt-1 block text-xs leading-5">保存于 {formatSavedAt(recovery.updatedAt)}。恢复后可继续编辑，再手动保存到 GitHub。</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ink-command" onClick={restoreRecovery}>恢复草稿</button>
                      <button type="button" className="ink-command" onClick={discardRecovery}>丢弃备份</button>
                    </div>
                  </div>
                )}

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

                  <div className="grid gap-2 text-sm font-medium text-[var(--ink-main)]">
                    <span>正文（Markdown）</span>
                    <AdminMarkdownEditor value={form.content} onChange={value => updateField('content', value)} maxLength={60000} />
                  </div>

                  {draftSaveState !== 'idle' && dirty && (
                    <DraftSaveStatus state={draftSaveState} savedAt={lastAutosavedAt} />
                  )}

                  {error && <InlineError>{error}</InlineError>}
                  {message && <p className="rounded-sm border border-[var(--ink-accent)] bg-[var(--ink-accent-soft)] px-3 py-2 text-sm text-[var(--ink-accent)]" role="status">{message}</p>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink-line)] pt-5">
                    <p className="text-xs leading-5 text-[var(--ink-muted)]">支持 GFM、代码块、表格、图片和 KaTeX 数学公式。编辑内容会先自动保存在本机浏览器。</p>
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

function DraftSaveStatus ({ state, savedAt }) {
  if (state === 'error') {
    return <p className="rounded-sm border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-3 py-2 text-sm text-[var(--ink-seal)]" role="alert">本地自动保存失败，请及时手动保存到 GitHub。</p>
  }
  const text = state === 'saved'
    ? '已自动保存到本机 · ' + formatSavedAt(savedAt)
    : '停止输入后会自动保存到本机……'
  return <p className="text-xs leading-5 text-[var(--ink-muted)]" role="status">{text}</p>
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

function createEmptyForm () {
  return {
    title: '',
    slug: '',
    summary: '',
    tags: '',
    date: new Date().toISOString().slice(0, 10),
    content: '',
    draft: true
  }
}

function findRecovery (number, baselineForm) {
  const draft = readLocalDraft(number)
  if (!draft || !hasDraftContent(draft.form)) return null
  if (sameForm(draft.form, baselineForm)) {
    removeLocalDraft(number)
    return null
  }
  return {
    number,
    form: draft.form,
    updatedAt: draft.updatedAt
  }
}

function readLocalDraft (number) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(number))
    if (!raw) return null
    const data = JSON.parse(raw)
    const form = normalizeDraftForm(data?.form)
    const updatedAt = Number(data?.updatedAt)
    if (!form || !Number.isFinite(updatedAt)) {
      removeLocalDraft(number)
      return null
    }
    return { form, updatedAt }
  } catch (error) {
    console.warn('Unable to read local draft:', error)
    return null
  }
}

function writeLocalDraft (number, form) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getDraftStorageKey(number), JSON.stringify({
    form: normalizeDraftForm(form),
    updatedAt: Date.now()
  }))
}

function removeLocalDraft (number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getDraftStorageKey(number))
  } catch (error) {
    console.warn('Unable to remove local draft:', error)
  }
}

function getDraftStorageKey (number) {
  return DRAFT_STORAGE_PREFIX + (number === null || number === undefined ? 'new' : String(number))
}

function normalizeDraftForm (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return {
    title: String(value.title || '').slice(0, 180),
    slug: String(value.slug || '').slice(0, 180),
    summary: String(value.summary || '').slice(0, 300),
    tags: String(value.tags || '').slice(0, 1000),
    date: String(value.date || '').slice(0, 10),
    content: String(value.content || '').slice(0, 60000),
    draft: value.draft !== false
  }
}

function hasDraftContent (form) {
  return Boolean(form && [form.title, form.slug, form.summary, form.tags, form.content].some(value => String(value || '').trim()))
}

function sameForm (left, right) {
  const a = normalizeDraftForm(left)
  const b = normalizeDraftForm(right)
  if (!a || !b) return false
  return a.title === b.title &&
    a.slug === b.slug &&
    a.summary === b.summary &&
    a.tags === b.tags &&
    a.date === b.date &&
    a.content === b.content &&
    a.draft === b.draft
}

function formatDateInput (value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10)
}

function formatSavedAt (value) {
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return '刚刚'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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