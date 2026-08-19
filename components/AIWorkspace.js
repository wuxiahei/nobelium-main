import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react'

const SESSION_KEY = 'ely-ai-sessions-v1'
const SETTINGS_KEY = 'ely-ai-settings-v1'
const MAX_LOCAL_SESSIONS = 20

const defaultSettings = {
  systemPrompt: '你是 Ely 博客的学习助手。回答应准确、简洁；公式使用标准 LaTeX，行内公式使用 $...$，展示公式使用 $$...$$。',
  articleContext: '',
  temperature: 0.4
}

export default function AIWorkspace () {
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState('')
  const [settings, setSettings] = useState(defaultSettings)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [mobilePanel, setMobilePanel] = useState('chat')
  const [service, setService] = useState({ enabled: false, displayName: 'AI 助手', model: '' })
  const inputRef = useRef(null)

  useEffect(() => {
    const savedSessions = readLocalJSON(SESSION_KEY, [])
    const savedSettings = readLocalJSON(SETTINGS_KEY, defaultSettings)
    const initialSessions = Array.isArray(savedSessions) && savedSessions.length
      ? savedSessions
      : [createSession()]

    setSessions(initialSessions)
    setActiveId(initialSessions[0].id)
    setSettings({ ...defaultSettings, ...savedSettings })
    setReady(true)

    fetch('/api/ai/config')
      .then(response => response.ok ? response.json() : null)
      .then(config => config && setService(config))
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessions.slice(0, MAX_LOCAL_SESSIONS)))
  }, [ready, sessions])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [ready, settings])

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeId) || sessions[0],
    [activeId, sessions]
  )

  const createNewSession = useCallback(() => {
    const session = createSession()
    setSessions(current => [session, ...current].slice(0, MAX_LOCAL_SESSIONS))
    setActiveId(session.id)
    setMobilePanel('chat')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  function deleteSession (sessionId) {
    setSessions(current => {
      const next = current.filter(session => session.id !== sessionId)
      if (next.length) {
        if (activeId === sessionId) setActiveId(next[0].id)
        return next
      }

      const replacement = createSession()
      setActiveId(replacement.id)
      return [replacement]
    })
  }

  function updateActiveSession (updater) {
    setSessions(current => current.map(session => (
      session.id === activeSession?.id ? updater(session) : session
    )))
  }

  async function sendMessage () {
    const content = input.trim()
    if (!content || loading || !activeSession) return

    const userMessage = { id: createId(), role: 'user', content }
    const requestMessages = [
      ...activeSession.messages.filter(message => ['user', 'assistant'].includes(message.role)),
      userMessage
    ]
    setInput('')
    setLoading(true)
    updateActiveSession(session => ({
      ...session,
      title: session.messages.length ? session.title : createTitle(content),
      messages: requestMessages,
      updatedAt: Date.now()
    }))

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: requestMessages.map(({ role, content }) => ({ role, content })),
          ...settings
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'AI 服务暂时不可用。')

      updateActiveSession(session => ({
        ...session,
        messages: [...session.messages, { id: createId(), role: 'assistant', content: data.message }],
        updatedAt: Date.now()
      }))
    } catch (error) {
      updateActiveSession(session => ({
        ...session,
        messages: [...session.messages, {
          id: createId(),
          role: 'error',
          content: error.message || '发送失败，请稍后重试。'
        }],
        updatedAt: Date.now()
      }))
    } finally {
      setLoading(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  function handleKeyDown (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <section className="ai-workspace" aria-label="AI 工作间">
      <div className="ai-mobile-tabs" role="tablist" aria-label="AI 工作间视图">
        <MobileTab active={mobilePanel === 'sessions'} onClick={() => setMobilePanel('sessions')} icon={MessageSquareText}>会话</MobileTab>
        <MobileTab active={mobilePanel === 'chat'} onClick={() => setMobilePanel('chat')} icon={Bot}>对话</MobileTab>
        <MobileTab active={mobilePanel === 'settings'} onClick={() => setMobilePanel('settings')} icon={Settings2}>设置</MobileTab>
      </div>

      <aside className={`ai-sidebar ${mobilePanel === 'sessions' ? 'ai-mobile-active' : ''}`}>
        <div className="ai-panel-heading">
          <div>
            <p className="ink-eyebrow">Ely</p>
            <h1>AI 工作间</h1>
          </div>
          <Bot className="h-5 w-5 text-[var(--ink-accent)]" aria-hidden="true" />
        </div>
        <button type="button" className="ink-command w-full" onClick={createNewSession}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          新建本地会话
        </button>
        <div className="ai-session-list" aria-label="本地会话">
          {sessions.map(session => (
            <div key={session.id} className={`ai-session ${session.id === activeSession?.id ? 'ai-session-active' : ''}`}>
              <button
                type="button"
                className="ai-session-select ink-focus"
                onClick={() => {
                  setActiveId(session.id)
                  setMobilePanel('chat')
                }}
              >
                <span>{session.title}</span>
                <small>{formatSessionTime(session.updatedAt)}</small>
              </button>
              <button
                type="button"
                className="ai-icon-button ink-focus"
                aria-label={`删除会话：${session.title}`}
                title="删除会话"
                onClick={() => deleteSession(session.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div className="ai-privacy-note">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>会话只保存在此浏览器</span>
        </div>
      </aside>

      <div className={`ai-chat ${mobilePanel === 'chat' ? 'ai-mobile-active' : ''}`}>
        <header className="ai-chat-header">
          <div>
            <p className="ink-eyebrow">当前会话</p>
            <h2>{activeSession?.title || '新会话'}</h2>
          </div>
          <div className={`ai-service-state ${service.enabled ? 'ai-service-online' : ''}`}>
            {service.enabled ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            <span>{service.enabled ? `${service.displayName}${service.model ? ` · ${service.model}` : ''}` : '等待管理员配置模型'}</span>
          </div>
        </header>

        <div className="ai-messages" aria-live="polite">
          {!activeSession?.messages.length && (
            <div className="ai-empty-state">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
              <h2>从一个具体问题开始</h2>
              <p>支持 Markdown、代码与 LaTeX 公式。文章内容只在你主动填入右侧上下文时发送。</p>
            </div>
          )}
          {activeSession?.messages.map(message => (
            <article key={message.id} className={`ai-message ai-message-${message.role}`}>
              <div className="ai-message-role">
                {message.role === 'user' ? '你' : message.role === 'error' ? '状态' : service.displayName}
              </div>
              <div className="ai-message-content">
                {message.role === 'assistant'
                  ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
                      components={{
                        a: props => <a {...props} target="_blank" rel="noreferrer" />
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    )
                  : <p>{message.content}</p>}
              </div>
            </article>
          ))}
          {loading && (
            <div className="ai-thinking">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在整理回答
            </div>
          )}
        </div>

        <div className="ai-composer">
          <textarea
            ref={inputRef}
            rows={3}
            value={input}
            maxLength={12000}
            placeholder={service.enabled ? '输入问题，Shift + Enter 换行' : '管理员配置模型后即可开始会话'}
            aria-label="输入消息"
            disabled={!service.enabled || loading}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="ai-send-button ink-focus"
            aria-label="发送消息"
            title="发送消息"
            disabled={!service.enabled || loading || !input.trim()}
            onClick={sendMessage}
          >
            {loading ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <aside className={`ai-settings ${mobilePanel === 'settings' ? 'ai-mobile-active' : ''}`}>
        <div className="ai-panel-heading">
          <div>
            <p className="ink-eyebrow">仅此浏览器</p>
            <h2>会话设置</h2>
          </div>
          <Settings2 className="h-5 w-5 text-[var(--ink-accent)]" aria-hidden="true" />
        </div>
        <label className="ai-field">
          <span>系统提示词</span>
          <textarea
            rows={7}
            maxLength={4000}
            value={settings.systemPrompt}
            onChange={event => setSettings(current => ({ ...current, systemPrompt: event.target.value }))}
          />
        </label>
        <label className="ai-field">
          <span>文章上下文</span>
          <textarea
            rows={7}
            maxLength={4000}
            placeholder="只粘贴本次会话需要引用的段落"
            value={settings.articleContext}
            onChange={event => setSettings(current => ({ ...current, articleContext: event.target.value }))}
          />
        </label>
        <label className="ai-field">
          <span>随机性 <output>{settings.temperature.toFixed(1)}</output></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.temperature}
            onChange={event => setSettings(current => ({ ...current, temperature: Number(event.target.value) }))}
          />
        </label>
        <button type="button" className="ink-command w-full" onClick={() => setSettings(defaultSettings)}>
          恢复默认设置
        </button>
        <p className="ai-settings-footnote">管理员通过服务端环境变量配置模型与密钥。浏览器不会获得 API Key，也不会把会话写入服务端数据库。</p>
      </aside>
    </section>
  )
}

function MobileTab ({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'active' : ''}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  )
}

function createSession () {
  const now = Date.now()
  return {
    id: createId(),
    title: '新会话',
    messages: [],
    createdAt: now,
    updatedAt: now
  }
}

function createId () {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createTitle (content) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized
}

function readLocalJSON (key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function formatSessionTime (timestamp) {
  if (!timestamp) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}
