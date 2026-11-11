import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import { AlertTriangle, CheckCircle2, Eye, FilePlus2, LogOut, Save, ShieldCheck, XCircle } from 'lucide-react'
import Container from '@/components/Container'
import ActionFeedback from '@/components/ActionFeedback'
import AdminDraftPreview from '@/components/AdminDraftPreview'
import AdminMarkdownEditor from '@/components/AdminMarkdownEditor'
import { appendDraftSnapshot, normalizeDraftSnapshots } from '@/lib/admin-draft-history.mjs'
import { runContentPreflight } from '@/lib/content-preflight.mjs'
import { getAdminPostKey, getAdminPostUrl } from '@/lib/admin-post-identity.mjs'

const DRAFT_STORAGE_PREFIX = 'nobelium:admin-draft:'
const AUTOSAVE_DELAY_MS = 1500
const EMPTY_FORM = createEmptyForm()

export default function AdminPage () {
  const [focusMode, setFocusMode] = useState(false)
  const focusButtonRef = useRef(null)
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [posts, setPosts] = useState([])
  const [sourceWarnings, setSourceWarnings] = useState([])
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [conflict, setConflict] = useState(false)
  const savePostRef = useRef(null)
  const isNotion = currentPost?.source === 'notion'
  const canWrite = isNotion ? session?.notionWriteConfigured : session?.writeConfigured
  const contentLocked = isNotion && currentPost.contentEditable === false
  const fieldLocked = field => isNotion && !currentPost.editableFields?.[field]
  const preflight = useMemo(() => runContentPreflight(form, {
    mode: 'publish',
    currentNumber,
    posts,
    skipContent: contentLocked
  }), [form, currentNumber, posts, contentLocked])

  useEffect(() => {
    if (!focusMode) return
    const exit = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setFocusMode(false)
        focusButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', exit)
    return () => window.removeEventListener('keydown', exit)
  }, [focusMode])

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true)
    try {
      const data = await requestJson('/api/admin/posts')
      setPosts(Array.isArray(data.posts) ? data.posts : [])
      setSourceWarnings(data.warnings || [])
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
    if (!dirty || !session?.authenticated) return
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
        const updatedAt = appendLocalDraftSnapshot(currentNumber, form)
        setLastAutosavedAt(updatedAt)
        setDraftSaveState('saved')
      } catch (storageError) {
        console.error(storageError)
        setDraftSaveState('error')
      }
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [form, dirty, recovery, saving, currentNumber, session?.authenticated])

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const handleShortcut = event => {
      if (!session?.authenticated || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      savePostRef.current?.()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [session?.authenticated])

  function updateField (field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setDirty(true)
    setDraftSaveState('pending')
    setConflict(false)
    setMessage('')
    setError('')
  }

  function persistCurrentDraft () {
    if (!hasDraftContent(form)) return true
    try {
      const updatedAt = appendLocalDraftSnapshot(currentNumber, form)
      setLastAutosavedAt(updatedAt)
      setDraftSaveState('saved')
      return true
    } catch (storageError) {
      console.error(storageError)
      setDraftSaveState('error')
      return false
    }
  }

  function canLeaveCurrentPost () {
    if (!dirty) return true
    const confirmed = window.confirm('当前文章还有未保存修改。切换前会先在本机保留一个版本，是否继续？')
    if (!confirmed) return false
    if (persistCurrentDraft()) return true
    return window.confirm('本地版本保存失败。仍要离开并放弃当前页面中的修改吗？')
  }

  function startNewPost () {
    if (!canLeaveCurrentPost()) return
    const nextForm = createEmptyForm()
    setCurrentNumber(null)
    setCurrentPost(null)
    setForm(nextForm)
    setError('')
    setMessage('')
    setDirty(false)
    setDraftSaveState('idle')
    setLastAutosavedAt(null)
    setConflict(false)
    setPreviewOpen(false)
    setRecovery(findRecovery(null, nextForm))
  }

  async function openPost (number) {
    if (!canLeaveCurrentPost()) return
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const data = await requestJson(getAdminPostUrl(number))
      const post = data.post
      const nextForm = {
        title: post.title || '',
        slug: post.slug || '',
        summary: post.summary || '',
        tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
        date: post.source === 'notion' ? String(post.date || '').slice(0, 10) : formatDateInput(post.date),
        content: data.content || '',
        draft: Boolean(post.draft)
      }
      setCurrentNumber(getAdminPostKey(post))
      setCurrentPost(post)
      setForm(nextForm)
      setDirty(false)
      setDraftSaveState('idle')
      setLastAutosavedAt(null)
      setConflict(false)
      setPreviewOpen(false)
      setRecovery(findRecovery(getAdminPostKey(post), nextForm))
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
    if (!canLeaveCurrentPost()) return
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
    setPreviewOpen(false)
    setConflict(false)
  }

  async function savePost (draft = isNotion ? Boolean(currentPost?.draft) : true) {
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')

    if (!canWrite) {
      setError(isNotion ? 'Notion 编辑尚未配置，请检查集成令牌和数据库 ID。' : '写文章尚未配置：请设置 CONTENT_GITHUB_REPO 和 CONTENT_GITHUB_TOKEN。')
      setSaving(false)
      return
    }

    const checks = runContentPreflight(form, {
      mode: draft ? 'draft' : 'publish',
      currentNumber,
      posts,
      skipContent: contentLocked
    })
    if (!checks.ready) {
      setError(checks.errors[0]?.message || '发布检查未通过。')
      setSaving(false)
      return
    }

    const payload = {
      ...form,
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      draft,
      ...(isNotion ? { expectedRevision: currentPost.revision, ...(contentLocked ? { content: undefined } : {}) } : {}),
      ...(currentNumber && currentPost?.updatedAt ? { expectedUpdatedAt: currentPost.updatedAt } : {})
    }
    const previousNumber = currentNumber
    const url = currentNumber ? getAdminPostUrl(currentNumber) : '/api/admin/posts'

    try {
      const data = await requestJson(url, {
        method: currentNumber ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      })
      const post = data.post
      setCurrentNumber(getAdminPostKey(post))
      setCurrentPost(post)
      setForm(current => ({
        ...current,
        title: post.title || '',
        slug: post.slug || '',
        summary: post.summary || '',
        tags: (post.tags || []).join(', '),
        date: post.source === 'notion' ? String(post.date || '').slice(0, 10) : formatDateInput(post.date),
        ...(typeof data.content === 'string' ? { content: data.content } : {}),
        draft: Boolean(post.draft)
      }))
      removeLocalDraft(previousNumber)
      removeLocalDraft(getAdminPostKey(post))
      setDirty(false)
      setDraftSaveState('idle')
      setLastAutosavedAt(null)
      setRecovery(null)
      setConflict(false)
      const savedMessage = isNotion ? '文章已保存回 Notion。' : draft ? '草稿已保存到 GitHub Issue。' : '文章已发布。'
      const cacheMessage = data.revalidation?.failed?.length ? '部分页面缓存暂未刷新，请稍后查看。' : '页面缓存已触发更新。'
      setMessage([savedMessage, cacheMessage, ...(data.warnings || [])].join(' '))
      await loadPosts()
    } catch (requestError) {
      if (requestError.status === 401) {
        setSession(current => current ? { ...current, authenticated: false } : current)
      }
      persistCurrentDraft()
      if (requestError.status === 409) {
        setConflict(true)
      }
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  savePostRef.current = savePost

  function restoreRecovery () {
    if (!recovery) return
    const selected = recovery.snapshots.find(snapshot => snapshot.updatedAt === recovery.selectedUpdatedAt) || recovery.snapshots[0]
    const nextForm = normalizeDraftForm(selected?.form)
    if (!nextForm) {
      setError('本地草稿内容无效，无法恢复。')
      return
    }
    setForm(nextForm)
    setCurrentNumber(recovery.number)
    if (recovery.number === null) {
      setCurrentPost(null)
    } else {
      setCurrentPost(current => current || posts.find(post => getAdminPostKey(post) === recovery.number) || null)
    }
    setDirty(true)
    setDraftSaveState('saved')
    setLastAutosavedAt(selected.updatedAt)
    setRecovery(null)
    setError('')
    setMessage('已恢复所选本地版本。确认内容后，请保存为草稿或发布。')
  }

  function discardRecovery () {
    if (!recovery) return
    removeLocalDraft(recovery.number)
    setRecovery(null)
    setDirty(false)
    setDraftSaveState('idle')
    setLastAutosavedAt(null)
    setMessage('已丢弃本地草稿版本。')
  }

  const selectedRecovery = recovery?.snapshots.find(snapshot => snapshot.updatedAt === recovery.selectedUpdatedAt) || recovery?.snapshots[0]

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container title="写作后台 · 管理员" description="Nobelium 管理员写作后台" headerMeta="管理员" robots="noindex, nofollow">
        <section className={'admin-studio w-full pb-16' + (focusMode ? ' admin-focus-mode' : '')}>
          <header className="admin-studio-header">
            <div>
              <p className="ink-eyebrow mb-2">Editorial desk</p>
              <h1>写作后台</h1>
              <p>统一管理 GitHub 与 Notion 文章，修改会保存回文章原来的来源。</p>
            </div>
            {session?.authenticated && (
              <div className="admin-user-badge">
                <span>{session.username}</span>
                <button type="button" className="ink-command" onClick={logout}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  退出
                </button>
              </div>
            )}
          </header>

          {checkingSession && <StatusCard>正在检查管理员会话……</StatusCard>}

          {!checkingSession && !session?.configured && (
            <StatusCard tone="warning">
              <strong>管理员账户尚未配置。</strong>
              <span className="mt-2 block">请在 Vercel 环境变量中设置 ADMIN_USERNAME、ADMIN_PASSWORD_HASH、ADMIN_SESSION_SECRET（至少 32 位）。不建议使用明文 ADMIN_PASSWORD。</span>
            </StatusCard>
          )}

          {!checkingSession && session?.configured && !session.authenticated && (
            <div className="admin-login-card">
              <div className="admin-login-intro">
                <p className="ink-eyebrow">Private edition</p>
                <h2>管理员登录</h2>
                <p>只有管理员账号可以创建、修改和发布文章。</p>
              </div>
              <form className="admin-login-form" onSubmit={login}>
                <label>
                  <span>管理员账号</span>
                  <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
                </label>
                <label>
                  <span>密码</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                      {showPassword ? '隐藏' : '显示'}
                    </button>
                  </div>
                </label>
                {error && <InlineError>{error}</InlineError>}
                <button type="submit" disabled={loggingIn} className="ink-command ink-command-primary disabled:opacity-60">
                  {loggingIn ? '正在登录……' : '进入写作台'}
                </button>
              </form>
            </div>
          )}

          {session?.authenticated && (
            <div className="admin-workflow">
              <div className="admin-workflow-bar" aria-label="写作流程">
                <span className="is-complete"><b>01</b> 文章档案</span>
                <span className={dirty ? 'is-current' : 'is-complete'}><b>02</b> 写作台</span>
                <span className={preflight.ready ? 'is-complete' : 'is-attention'}><b>03</b> 发布检查</span>
              </div>

              <div className="admin-studio-grid">
                <aside className="admin-archive">
                  <div className="admin-archive-heading">
                    <div>
                      <p className="ink-eyebrow">Archive</p>
                      <h2>文章档案</h2>
                    </div>
                    <span>{posts.length}</span>
                  </div>
                  <button type="button" className="ink-command ink-command-primary admin-new-post" disabled={saving || !session.writeConfigured} onClick={startNewPost}>
                    <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                    新建 GitHub 文章
                  </button>
                  <div className="admin-archive-label">
                    <span>GitHub · Notion</span>
                    {loadingPosts && <span>读取中</span>}
                  </div>
                  {sourceWarnings.map(warning => <InlineError key={warning}>{warning}</InlineError>)}
                  <div className="admin-archive-list">
                    {!loadingPosts && posts.length === 0 && (
                      <p className="admin-archive-empty">暂无可管理的文章。Notion 文章需来自已连接的博客数据库，类型为 Post 或 Page。</p>
                    )}
                    {posts.map(post => (
                      <button
                        key={getAdminPostKey(post)}
                        type="button"
                        disabled={saving}
                        onClick={() => openPost(getAdminPostKey(post))}
                        className={'admin-archive-item' + (currentNumber === getAdminPostKey(post) ? ' is-active' : '')}
                      >
                        <span className={'admin-archive-status ' + (post.draft ? 'is-draft' : 'is-live')}>{post.draft ? '草稿' : '已发布'}</span>
                        <strong>{post.title}</strong>
                        <small>{post.source === 'notion' ? 'Notion' : 'GitHub #' + post.githubIssueNumber} · {formatArchiveDate(post.updatedAt || post.date)}</small>
                      </button>
                    ))}
                  </div>
                </aside>

                <main className="admin-writing-desk">
                  <header className="admin-desk-header">
                    <div>
                      <p className="ink-eyebrow">{currentNumber ? (isNotion ? 'Notion article' : 'Issue #' + currentNumber) : 'New entry'}</p>
                      <h2>{currentNumber ? '编辑文章' : '新建文章'}</h2>
                      <p>{isNotion ? '修改将保存回原 Notion 页面' : currentPost?.updatedAt ? '线上版本已同步' : '新文章将保存到 GitHub Issue'}</p>
                    </div>
                    <div className="admin-desk-actions">
                      <button ref={focusButtonRef} type="button" className="ink-command" aria-pressed={focusMode} onClick={() => setFocusMode(current => !current)}>
                        {focusMode ? '退出专注 · Esc' : '专注写作'}
                      </button>
                      <button type="button" className="ink-command" onClick={() => setPreviewOpen(true)}>
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        预览当前内容
                      </button>
                      {currentPost?.notionUrl && <a href={currentPost.notionUrl} target="_blank" rel="noreferrer" className="ink-command">在 Notion 中编辑</a>}
                      {currentPost?.githubIssueUrl && (
                        <a href={currentPost.githubIssueUrl} target="_blank" rel="noreferrer" className="ink-command">GitHub Issue</a>
                      )}
                      {currentNumber && !isNotion && currentPost?.draft && (
                        <a href={'/preview/' + currentNumber} target="_blank" rel="noreferrer" className="ink-command">已保存草稿</a>
                      )}
                      {currentPost && !currentPost.draft && currentPost.slug && (
                        <a href={'/' + currentPost.slug} target="_blank" rel="noreferrer" className="ink-command">查看文章</a>
                      )}
                    </div>
                  </header>

                  {!canWrite && (
                    <InlineError>{isNotion ? '请检查 Notion 集成令牌、数据库连接和更新内容权限。' : '新建 GitHub 文章需要配置 CONTENT_GITHUB_REPO 和具有 Issues 读写权限的 CONTENT_GITHUB_TOKEN；已有 Notion 文章可从左侧打开。'}</InlineError>
                  )}

                  {recovery && (
                    <div className="admin-recovery-card">
                      <div>
                        <strong>发现 {recovery.snapshots.length} 个本机草稿版本</strong>
                        <p>最近保存于 {formatSavedAt(selectedRecovery?.updatedAt)}。恢复一个版本不会覆盖其他版本。</p>
                      </div>
                      <div className="admin-recovery-actions">
                        <select
                          value={recovery.selectedUpdatedAt}
                          onChange={event => setRecovery(current => ({ ...current, selectedUpdatedAt: Number(event.target.value) }))}
                          aria-label="选择要恢复的本地草稿版本"
                        >
                          {recovery.snapshots.map((snapshot, index) => (
                            <option key={snapshot.updatedAt} value={snapshot.updatedAt}>
                              {index === 0 ? '最新 · ' : ''}{formatSavedAt(snapshot.updatedAt)} · {snapshot.form.title || '未命名'}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="ink-command" onClick={restoreRecovery}>恢复所选版本</button>
                        <button type="button" className="ink-command" onClick={discardRecovery}>全部丢弃</button>
                      </div>
                    </div>
                  )}

                  {conflict && (
                    <div className="admin-conflict-card" role="alert">
                      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                      <div>
                        <strong>检测到线上版本冲突</strong>
                        <p>你的当前输入仍保留在本机。请先重新打开这篇文章查看线上版本，再合并需要的修改。</p>
                      </div>
                      {currentNumber && <button type="button" className="ink-command" disabled={saving} onClick={() => openPost(currentNumber)}>重新载入线上版本</button>}
                    </div>
                  )}

                  <div className="admin-desk-grid">
                    <div className="admin-desk-main">
                      {isNotion && <p className="admin-draft-status">灰色字段由 Notion 数据库结构决定；特殊排版请在 Notion 中查看。{contentLocked ? currentPost.contentWarning : 'Ctrl / Cmd + S 会保留当前发布状态。'}</p>}
                      <fieldset disabled={saving} className="admin-form-grid">
                        <label className="admin-field admin-field-title">
                          <span>标题</span>
                          <input disabled={fieldLocked('title')} value={form.title} onChange={event => updateField('title', event.target.value)} maxLength={180} required placeholder="给这次思考一个准确的名字" />
                        </label>

                        <div className="admin-field-row">
                          <label className="admin-field">
                            <span>日期</span>
                            <input type="date" disabled={fieldLocked('date')} value={form.date} onChange={event => updateField('date', event.target.value)} />
                          </label>
                          <label className="admin-field">
                            <span>{isNotion ? 'Slug（文章地址）' : 'Slug（可留空自动生成）'}</span>
                            <input disabled={fieldLocked('slug')} value={form.slug} onChange={event => updateField('slug', event.target.value)} placeholder="my-post" />
                          </label>
                        </div>

                        <label className="admin-field">
                          <span>{isNotion ? '摘要' : '摘要（可留空自动提取）'}</span>
                          <textarea disabled={fieldLocked('summary')} value={form.summary} onChange={event => updateField('summary', event.target.value)} maxLength={300} rows={3} placeholder="用一两句话说明文章解决什么问题" />
                        </label>

                        <label className="admin-field">
                          <span>标签（英文逗号分隔）</span>
                          <input disabled={fieldLocked('tags')} value={form.tags} onChange={event => updateField('tags', event.target.value)} placeholder="Next.js, Vercel" />
                        </label>

                        <div className="admin-field admin-editor-field">
                          <span>正文（Markdown）</span>
                          {contentLocked
                            ? <textarea aria-label="Notion 正文（只读）" readOnly rows={18} value={form.content} />
                            : <AdminMarkdownEditor key={currentNumber || 'new'} source={isNotion ? 'notion' : 'github'} value={form.content} onChange={value => updateField('content', value)} maxLength={60000} />}
                        </div>
                      </fieldset>

                      {draftSaveState !== 'idle' && dirty && (
                        <DraftSaveStatus state={draftSaveState} savedAt={lastAutosavedAt} />
                      )}

                      {error && <InlineError>{error}</InlineError>}
                      <ActionFeedback state={saving ? 'loading' : 'success'}>{saving ? '正在保存文章，请稍候…' : message}</ActionFeedback>

                      <footer className="admin-save-bar">
                        <p>{isNotion ? 'Ctrl / Cmd + S 保存修改，保留当前发布状态。' : 'Ctrl / Cmd + S 保存草稿。正文会先形成本机版本，再同步到 GitHub。'}</p>
                        <div>
                          {isNotion ? <>
                            {currentPost.editableFields?.draft && <button type="button" disabled={saving || !canWrite} onClick={() => savePost(!currentPost.draft)} className="ink-command disabled:opacity-60">
                              {currentPost.draft ? '发布文章' : '转为草稿'}
                            </button>}
                            <button type="button" disabled={saving || !canWrite} onClick={() => savePost(currentPost.draft)} className="ink-command ink-command-primary disabled:opacity-60">
                              <Save className="h-4 w-4" aria-hidden="true" />{saving ? '保存中……' : '保存到 Notion'}
                            </button>
                          </> : <>
                            <button type="button" disabled={saving || !canWrite} onClick={() => savePost(true)} className="ink-command disabled:opacity-60">
                              <Save className="h-4 w-4" aria-hidden="true" />{saving ? '保存中……' : '保存为草稿'}
                            </button>
                            <button type="button" disabled={saving || !canWrite} onClick={() => savePost(false)} className="ink-command ink-command-primary disabled:opacity-60">
                              {saving ? '保存中……' : currentPost?.draft ? '发布文章' : '更新并发布'}
                            </button>
                          </>}
                        </div>
                      </footer>
                    </div>

                    <aside className="admin-checks" aria-label="发布前检查">
                      <div className="admin-check-heading">
                        <div>
                          <p className="ink-eyebrow">Preflight</p>
                          <h3>发布检查</h3>
                        </div>
                        <span className={preflight.ready ? 'is-ready' : 'is-blocked'}>
                          {preflight.ready ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                          {preflight.ready ? '可发布' : preflight.errors.length + ' 项阻塞'}
                        </span>
                      </div>
                      <div className="admin-check-summary">
                        <span>{preflight.errors.length} 错误</span>
                        <span>{preflight.warnings.length} 提醒</span>
                        <span>{preflight.imageCount} 图片</span>
                        <span>{preflight.tagCount} 标签</span>
                      </div>
                      <div className="admin-check-list">
                        {preflight.issues.length === 0 && (
                          <p className="admin-check-clean"><ShieldCheck className="h-5 w-5" aria-hidden="true" />标题、正文、链接与图片检查均通过。</p>
                        )}
                        {preflight.issues.map(issue => (
                          <p key={issue.code} className={issue.level === 'error' ? 'is-error' : 'is-warning'}>
                            {issue.level === 'error' ? <XCircle className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                            <span>{issue.message}{issue.detail ? <small>{issue.detail}</small> : null}</span>
                          </p>
                        ))}
                      </div>
                      <div className="admin-check-note">
                        <strong>本地版本</strong>
                        <p>最多保留最近 5 个版本。文章保存成功后才会清理对应本机版本。</p>
                      </div>
                    </aside>
                  </div>
                </main>
              </div>
            </div>
          )}
        </section>
      </Container>

      {previewOpen && <AdminDraftPreview form={form} onClose={() => setPreviewOpen(false)} />}
    </>
  )
}

function DraftSaveStatus ({ state, savedAt }) {
  if (state === 'error') {
    return <p className="admin-draft-status is-error" role="alert">本地自动保存失败，请及时手动保存文章。</p>
  }
  const text = state === 'saved'
    ? '已保存本机版本 · ' + formatSavedAt(savedAt)
    : '停止输入后会自动保存本机版本……'
  return <p className="admin-draft-status" role="status">{text}</p>
}

function StatusCard ({ children, tone = 'default' }) {
  const toneClass = tone === 'warning'
    ? 'border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] text-[var(--ink-seal)]'
    : 'border-[var(--ink-line)] bg-[var(--ink-surface)] text-[var(--ink-muted)]'
  return <div className={'mx-auto max-w-2xl rounded-sm border px-5 py-5 text-sm leading-7 ' + toneClass}>{children}</div>
}

function InlineError ({ children }) {
  return <ActionFeedback state="error">{children}</ActionFeedback>
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
  const history = readLocalDraftHistory(number)
  const snapshots = history.filter(snapshot => !sameForm(snapshot.form, baselineForm))
  if (!snapshots.length) {
    if (history.length) removeLocalDraft(number)
    return null
  }
  return {
    number,
    snapshots,
    selectedUpdatedAt: snapshots[0].updatedAt
  }
}

function readLocalDraftHistory (number) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(number))
    if (!raw) return []
    const data = JSON.parse(raw)
    const source = Array.isArray(data?.snapshots)
      ? data.snapshots
      : data?.form
        ? [{ form: data.form, updatedAt: data.updatedAt }]
        : []
    return normalizeDraftSnapshots(source)
      .map(snapshot => ({ ...snapshot, form: normalizeDraftForm(snapshot.form) }))
      .filter(snapshot => snapshot.form && hasDraftContent(snapshot.form))
  } catch (error) {
    console.warn('Unable to read local draft:', error)
    return []
  }
}

function appendLocalDraftSnapshot (number, form) {
  if (typeof window === 'undefined') return Date.now()
  const normalized = normalizeDraftForm(form)
  if (!normalized) throw new Error('Invalid draft form')
  const history = readLocalDraftHistory(number)
  const snapshots = appendDraftSnapshot(history, normalized, Date.now(), sameForm)
  window.localStorage.setItem(getDraftStorageKey(number), JSON.stringify({
    version: 2,
    snapshots
  }))
  return snapshots[0].updatedAt
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

function formatArchiveDate (value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期待定'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
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