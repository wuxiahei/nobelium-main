import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import ActionFeedback from '@/components/ActionFeedback'

const INITIAL_FORM = {
  profileId: '',
  profileName: '',
  baseURL: '',
  protocol: 'chat_completions',
  model: '',
  displayName: 'AI 助手',
  apiKey: ''
}

export default function AdminAISettings ({ onClose }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [config, setConfig] = useState(null)
  const [activateAfterSave, setActivateAfterSave] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [profileAction, setProfileAction] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const urlRef = useRef(null)
  const profileNameRef = useRef(null)

  useEffect(() => {
    let active = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => urlRef.current?.focus(), 0)

    requestJson('/api/admin/ai-config')
      .then(view => {
        if (!active) return
        setConfig(view)
        setForm(formFromView(view, view.activeProfileId))
      })
      .catch(requestError => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const handleKeyDown = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      active = false
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function updateField (field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
    setMessage('')
  }

  function editProfile (profile) {
    setForm({
      profileId: profile.id,
      profileName: profile.profileName || '',
      baseURL: profile.baseURL || '',
      protocol: profile.protocol || 'chat_completions',
      model: profile.model || '',
      displayName: profile.displayName || 'AI 助手',
      apiKey: ''
    })
    setActivateAfterSave(profile.isActive)
    setShowKey(false)
    setError('')
    setMessage('')
  }

  function startNewProfile () {
    const activeProfile = config?.profiles?.find(profile => profile.id === config.activeProfileId)
    setForm({
      profileId: '',
      profileName: '',
      baseURL: activeProfile?.baseURL || config?.baseURL || '',
      protocol: activeProfile?.protocol || config?.protocol || 'chat_completions',
      model: activeProfile?.model || config?.model || '',
      displayName: activeProfile?.displayName || config?.displayName || 'AI 助手',
      apiKey: ''
    })
    setActivateAfterSave(true)
    setShowKey(false)
    setError('')
    setMessage('')
    window.setTimeout(() => profileNameRef.current?.focus(), 0)
  }

  async function saveSettings (event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_profile',
          ...form,
          activate: activateAfterSave
        })
      })
      const savedProfile = view.profiles?.find(profile => profile.id === view.savedProfileId)
      setConfig(view)
      setForm(formFromView(view, view.savedProfileId || view.activeProfileId))
      setActivateAfterSave(Boolean(savedProfile?.isActive))
      setShowKey(false)
      setMessage(activateAfterSave ? '配置已保存并设为当前使用。' : '配置已保存。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function activateProfile (profileId) {
    setProfileAction(`activate:${profileId}`)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'activate_profile', profileId })
      })
      setConfig(view)
      setForm(formFromView(view, view.activeProfileId))
      setActivateAfterSave(true)
      setShowKey(false)
      setMessage('已切换当前使用的 AI 配置，下一次对话立即生效。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProfileAction('')
    }
  }

  async function deleteProfile (profile) {
    const warning = profile.isActive
      ? `删除“${profile.profileName}”后，会自动切换到下一套配置。继续吗？`
      : `确定删除“${profile.profileName}”吗？`
    if (!window.confirm(warning)) return

    setProfileAction(`delete:${profile.id}`)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete_profile', profileId: profile.id })
      })
      setConfig(view)
      setForm(formFromView(view, view.activeProfileId))
      setActivateAfterSave(true)
      setShowKey(false)
      setMessage('AI 配置已删除。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProfileAction('')
    }
  }

  async function resetSettings () {
    if (!window.confirm('恢复为环境变量配置后，后台保存的所有 AI 配置档案与 Key 将被删除。继续吗？')) return
    setResetting(true)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', { method: 'DELETE' })
      setConfig(view)
      setForm(formFromView(view, view.activeProfileId))
      setActivateAfterSave(true)
      setShowKey(false)
      setMessage('已恢复环境变量中的 AI 配置。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setResetting(false)
    }
  }

  const busy = loading || saving || resetting || Boolean(profileAction)
  const selectedProfile = config?.profiles?.find(profile => profile.id === form.profileId)
  const selectedKeyConfigured = Boolean(selectedProfile?.apiKeyConfigured)
  const canAddProfile = Boolean(config) && (config.profiles?.length || 0) < (config.maxProfiles || 10)
  const dialog = (
    <div className="admin-ai-settings-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="admin-ai-settings" role="dialog" aria-modal="true" aria-labelledby="admin-ai-settings-title">
        <header className="admin-ai-settings-header">
          <div>
            <p className="ink-eyebrow">Server-side connections</p>
            <h2 id="admin-ai-settings-title">AI 接口</h2>
            <p>可保存多套服务商配置并一键切换。模型标识、接口地址与 Key 仅供管理员查看，访客只会看到对外显示名称。</p>
          </div>
          <button type="button" className="admin-ai-settings-close" onClick={onClose} aria-label="关闭 AI 接口设置">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {loading
          ? (
            <div className="admin-ai-settings-loading">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              正在读取服务端配置……
            </div>
            )
          : (
            <div className="admin-ai-settings-content">
              <div className="admin-ai-settings-status">
                <div>
                  <span className={config?.source === 'admin' ? 'is-admin' : 'is-env'}>
                    {config?.source === 'admin' ? `${config.profiles?.length || 0} 套配置 · 当前使用` : '环境变量'}
                  </span>
                  <p>
                    {config?.source === 'admin'
                      ? (config.updatedAt ? `最近更新于 ${formatDateTime(config.updatedAt)}` : '配置已加密保存在 Vercel Blob 中')
                      : '尚未保存后台配置，当前读取 AI_API_KEY、AI_BASE_URL 与 AI_MODEL。'}
                  </p>
                </div>
                <span className={'admin-ai-key-state' + (config?.apiKeyConfigured ? ' is-configured' : '')}>
                  {config?.apiKeyConfigured ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  {config?.apiKeyConfigured ? '当前 Key 可用' : '当前 Key 未配置'}
                </span>
              </div>

              {config?.warning && (
                <div className="admin-ai-settings-notice is-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>{config.warning}</span>
                </div>
              )}

              {config?.persistenceWarning && (
                <div className="admin-ai-settings-notice is-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>{config.persistenceWarning}</span>
                </div>
              )}

              {error && <ActionFeedback state="error">{error}</ActionFeedback>}
              {message && <ActionFeedback>{message}</ActionFeedback>}

              <section className="admin-ai-profiles" aria-labelledby="admin-ai-profiles-title">
                <div className="admin-ai-profiles-heading">
                  <div>
                    <p className="ink-eyebrow">Saved profiles</p>
                    <h3 id="admin-ai-profiles-title">配置档案</h3>
                    <p>点选档案可修改字段；切换使用不会改动 Key，也无需重新填写。</p>
                  </div>
                  <button type="button" className="ink-command" onClick={startNewProfile} disabled={busy || !canAddProfile || !config?.canPersist}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    新建配置
                  </button>
                </div>

                {config?.profiles?.length
                  ? (
                    <div className="admin-ai-profile-list">
                      {config.profiles.map(profile => {
                        const editing = profile.id === form.profileId
                        return (
                          <article
                            key={profile.id}
                            className={`admin-ai-profile-card${profile.isActive ? ' is-active' : ''}${editing ? ' is-editing' : ''}`}
                          >
                            <button type="button" className="admin-ai-profile-main" onClick={() => editProfile(profile)} disabled={busy}>
                              <span className="admin-ai-profile-icon">
                                <Layers3 className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="admin-ai-profile-copy">
                                <strong>{profile.profileName}</strong>
                                <small>{profile.displayName} · {protocolLabel(profile.protocol)}</small>
                              </span>
                              {profile.isActive && <span className="admin-ai-profile-badge">当前使用</span>}
                            </button>
                            <div className="admin-ai-profile-actions">
                              <button
                                type="button"
                                className="ink-command"
                                onClick={() => activateProfile(profile.id)}
                                disabled={busy || profile.isActive}
                              >
                                {profileAction === `activate:${profile.id}` ? '切换中……' : profile.isActive ? '使用中' : '切换使用'}
                              </button>
                              <button
                                type="button"
                                className="admin-ai-profile-delete"
                                onClick={() => deleteProfile(profile)}
                                disabled={busy}
                                aria-label={`删除配置：${profile.profileName}`}
                                title="删除配置"
                              >
                                {profileAction === `delete:${profile.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                    )
                  : (
                    <div className="admin-ai-profile-empty">
                      <KeyRound className="h-5 w-5" aria-hidden="true" />
                      <div>
                        <strong>当前使用环境变量配置</strong>
                        <span>保存第一套配置后，即可在后台随时创建、编辑和切换多套连接。</span>
                      </div>
                    </div>
                    )}
                {config?.maxProfiles && (
                  <p className="admin-ai-profiles-limit">已保存 {config.profiles?.length || 0} / {config.maxProfiles} 套。Key 密文保存在服务端，浏览器无法读取。</p>
                )}
              </section>

              <form className="admin-ai-settings-form" onSubmit={saveSettings}>
                <div className="admin-ai-settings-form-title">
                  <div>
                    <p className="ink-eyebrow">{form.profileId ? 'Edit profile' : 'New profile'}</p>
                    <h3>{form.profileId ? '编辑当前档案' : '新建 AI 配置'}</h3>
                  </div>
                  {selectedKeyConfigured && <span className="admin-ai-key-state is-configured">Key 已保存</span>}
                </div>

                <div className="admin-ai-settings-row">
                  <label className="admin-ai-settings-field">
                    <span>配置名称</span>
                    <input
                      ref={profileNameRef}
                      value={form.profileName}
                      onChange={event => updateField('profileName', event.target.value)}
                      placeholder="例如 主力线路、备用线路"
                      autoComplete="off"
                      maxLength={48}
                      disabled={busy}
                      required
                    />
                    <small>仅在后台用于识别，不会展示给访客。</small>
                  </label>
                  <label className="admin-ai-settings-field">
                    <span>对外显示名称</span>
                    <input
                      value={form.displayName}
                      onChange={event => updateField('displayName', event.target.value)}
                      placeholder="AI 助手"
                      autoComplete="off"
                      maxLength={48}
                      disabled={busy}
                      required
                    />
                    <small>访客看到的名字；具体模型名称不会公开。</small>
                  </label>
                </div>

                <label className="admin-ai-settings-field">
                  <span>接口协议</span>
                  <select
                    value={form.protocol}
                    onChange={event => updateField('protocol', event.target.value)}
                    disabled={busy}
                  >
                    <option value="chat_completions">Chat Completions（/chat/completions）</option>
                    <option value="responses">Responses（/responses）</option>
                  </select>
                  <small>
                    系统会按协议自动拼接请求路径。
                    {config?.userAgent ? ` 当前 User-Agent：${config.userAgent}` : ''}
                  </small>
                </label>

                <label className="admin-ai-settings-field">
                  <span>接口 URL</span>
                  <input
                    ref={urlRef}
                    type="url"
                    value={form.baseURL}
                    onChange={event => updateField('baseURL', event.target.value)}
                    placeholder="https://api.openai.com/v1"
                    autoComplete="url"
                    spellCheck="false"
                    disabled={busy}
                    required
                  />
                  <small>填写基础地址，不要把 /chat/completions 或 /responses 拼在末尾。</small>
                </label>

                <label className="admin-ai-settings-field">
                  <span>模型名称</span>
                  <input
                    value={form.model}
                    onChange={event => updateField('model', event.target.value)}
                    placeholder="例如 gpt-4.1-mini"
                    autoComplete="off"
                    maxLength={160}
                    spellCheck="false"
                    disabled={busy}
                    required
                  />
                  <small>仅后台可见，不会通过公开接口或对话响应返回给浏览器。</small>
                </label>

                <label className="admin-ai-settings-field">
                  <span>API Key</span>
                  <div className="admin-ai-settings-secret">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={event => updateField('apiKey', event.target.value)}
                      placeholder={selectedKeyConfigured ? '已保存，留空保持不变' : '输入服务商 API Key'}
                      autoComplete="new-password"
                      maxLength={4096}
                      spellCheck="false"
                      disabled={busy}
                    />
                    <button type="button" onClick={() => setShowKey(current => !current)} disabled={busy} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                      {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      {showKey ? '隐藏' : '显示'}
                    </button>
                  </div>
                  <small>每套配置独立保存 Key。Key 只会提交到服务端并加密，已保存的 Key 不会回传到浏览器。</small>
                </label>

                <label className="admin-ai-activate-option">
                  <input
                    type="checkbox"
                    checked={activateAfterSave}
                    onChange={event => setActivateAfterSave(event.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    <strong>保存后设为当前配置</strong>
                    <small>取消后只保存档案，不切换正在使用的连接。</small>
                  </span>
                </label>

                <div className="admin-ai-settings-security">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <p>保存需要 Vercel Blob 与至少 32 字符的 ADMIN_SESSION_SECRET（或独立的 AI_CONFIG_ENCRYPTION_KEY）。</p>
                </div>

                <footer className="admin-ai-settings-actions">
                  <button
                    type="button"
                    className="ink-command"
                    onClick={resetSettings}
                    disabled={busy || !config?.canReset}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {resetting ? '恢复中……' : '恢复环境变量配置'}
                  </button>
                  <div>
                    <button type="button" className="ink-command" onClick={onClose} disabled={saving || resetting}>关闭</button>
                    <button type="submit" className="ink-command ink-command-primary" disabled={busy || !config?.canPersist}>
                      {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                      {saving ? '保存中……' : form.profileId ? '保存此配置' : '保存新配置'}
                    </button>
                  </div>
                </footer>
              </form>
            </div>
            )}
      </section>
    </div>
  )

  // The page-stage animation creates a transform containing block for fixed
  // descendants. Render this dialog outside it so it always fills the viewport.
  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}

function formFromView (view, preferredProfileId) {
  const profile = view?.profiles?.find(item => item.id === preferredProfileId)
    || view?.profiles?.find(item => item.id === view.activeProfileId)
  return {
    profileId: profile?.id || '',
    profileName: profile?.profileName || '',
    baseURL: profile?.baseURL || view?.baseURL || '',
    protocol: profile?.protocol || view?.protocol || 'chat_completions',
    model: profile?.model || view?.model || '',
    displayName: profile?.displayName || view?.displayName || 'AI 助手',
    apiKey: ''
  }
}

function protocolLabel (protocol) {
  return protocol === 'responses' ? 'Responses' : 'Chat Completions'
}

async function requestJson (url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const requestError = new Error(data.error || 'AI 配置请求失败，请稍后重试。')
    requestError.status = response.status
    throw requestError
  }
  return data
}

function formatDateTime (value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}