import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  X
} from 'lucide-react'
import ActionFeedback from '@/components/ActionFeedback'

const INITIAL_FORM = {
  baseURL: '',
  model: '',
  displayName: 'AI 助手',
  apiKey: ''
}

export default function AdminAISettings ({ onClose }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const urlRef = useRef(null)

  useEffect(() => {
    let active = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => urlRef.current?.focus(), 0)

    requestJson('/api/admin/ai-config')
      .then(view => {
        if (!active) return
        setConfig(view)
        setForm({
          baseURL: view.baseURL || '',
          model: view.model || '',
          displayName: view.displayName || 'AI 助手',
          apiKey: ''
        })
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

  async function saveSettings (event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', {
        method: 'POST',
        body: JSON.stringify(form)
      })
      setConfig(view)
      setForm(current => ({
        baseURL: view.baseURL || '',
        model: view.model || '',
        displayName: view.displayName || 'AI 助手',
        apiKey: ''
      }))
      setShowKey(false)
      setMessage('AI 接口配置已保存，下一次对话会立即使用新配置。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function resetSettings () {
    if (!window.confirm('恢复为环境变量配置后，后台保存的 URL、模型与 Key 将被删除。继续吗？')) return
    setResetting(true)
    setError('')
    setMessage('')

    try {
      const view = await requestJson('/api/admin/ai-config', { method: 'DELETE' })
      setConfig(view)
      setForm({
        baseURL: view.baseURL || '',
        model: view.model || '',
        displayName: view.displayName || 'AI 助手',
        apiKey: ''
      })
      setShowKey(false)
      setMessage('已恢复环境变量中的 AI 配置。')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setResetting(false)
    }
  }

  const busy = loading || saving || resetting

  const dialog = (
    <div className="admin-ai-settings-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="admin-ai-settings" role="dialog" aria-modal="true" aria-labelledby="admin-ai-settings-title">
        <header className="admin-ai-settings-header">
          <div>
            <p className="ink-eyebrow">Server-side connection</p>
            <h2 id="admin-ai-settings-title">AI 接口</h2>
            <p>支持 OpenAI-compatible Chat Completions 接口。保存后立即影响站内 AI 工作间。</p>
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
                    {config?.source === 'admin' ? '后台已保存' : '环境变量'}
                  </span>
                  <p>
                    {config?.source === 'admin'
                      ? (config.updatedAt ? `更新于 ${formatDateTime(config.updatedAt)}` : '配置已加密保存在 Vercel Blob 中')
                      : '尚未保存后台配置，当前读取 AI_API_KEY、AI_BASE_URL 与 AI_MODEL。'}
                  </p>
                </div>
                <span className={'admin-ai-key-state' + (config?.apiKeyConfigured ? ' is-configured' : '')}>
                  {config?.apiKeyConfigured ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  {config?.apiKeyConfigured ? 'Key 已配置' : 'Key 未配置'}
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

              <form className="admin-ai-settings-form" onSubmit={saveSettings}>
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
                  <small>填写基础地址，不要把 /chat/completions 拼在末尾；系统会自动添加。</small>
                </label>

                <div className="admin-ai-settings-row">
                  <label className="admin-ai-settings-field">
                    <span>模型名称</span>
                    <input
                      value={form.model}
                      onChange={event => updateField('model', event.target.value)}
                      placeholder="例如 gpt-4.1-mini"
                      autoComplete="off"
                      maxLength={160}
                      disabled={busy}
                      required
                    />
                  </label>
                  <label className="admin-ai-settings-field">
                    <span>显示名称</span>
                    <input
                      value={form.displayName}
                      onChange={event => updateField('displayName', event.target.value)}
                      placeholder="AI 助手"
                      autoComplete="off"
                      maxLength={48}
                      disabled={busy}
                      required
                    />
                  </label>
                </div>

                <label className="admin-ai-settings-field">
                  <span>API Key</span>
                  <div className="admin-ai-settings-secret">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={event => updateField('apiKey', event.target.value)}
                      placeholder={config?.apiKeyConfigured ? '已保存，留空保持不变' : '输入服务商 API Key'}
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
                  <small>Key 只会提交到服务端并加密保存，已保存的 Key 不会回传到浏览器。</small>
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
                      {saving ? '保存中……' : '保存 AI 配置'}
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