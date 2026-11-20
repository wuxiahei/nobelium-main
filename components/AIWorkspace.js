import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  BookOpenText,
  Bot,
  CheckCircle2,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X
} from 'lucide-react'

const SESSION_KEY = 'ely-ai-sessions-v1'
const SETTINGS_KEY = 'ely-ai-settings-v1'
const MAX_LOCAL_SESSIONS = 20
const MAX_ATTACHMENTS = 3
const MAX_CONVERSATION_IMAGES = 4
const MAX_IMAGE_SOURCE_BYTES = 12 * 1024 * 1024
const TARGET_IMAGE_BYTES = 700 * 1024
const MAX_TEXT_FILE_BYTES = 256 * 1024
const MAX_TEXT_ATTACHMENT_LENGTH = 120000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const TEXT_EXTENSIONS = new Set(['csv', 'json', 'log', 'md', 'markdown', 'txt', 'yaml', 'yml'])
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/x-yaml',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/yaml'
])

const defaultSettings = {
  systemPrompt: '你是 Ely 博客的学习助手。回答应准确、简洁；公式使用标准 LaTeX，行内公式使用 $...$，展示公式使用 $...$。',
  articleContext: '',
  useBlogContext: true,
  temperature: 0.4
}

export default function AIWorkspace () {
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState('')
  const [settings, setSettings] = useState(defaultSettings)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [attaching, setAttaching] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [mobilePanel, setMobilePanel] = useState('chat')
  const [service, setService] = useState({ enabled: false, displayName: 'AI 助手' })
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortControllerRef = useRef(null)

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
    return () => abortControllerRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!ready) return
    writeLocalJSON(SESSION_KEY, serializeSessions(sessions.slice(0, MAX_LOCAL_SESSIONS)))
  }, [ready, sessions])

  useEffect(() => {
    if (!ready) return
    writeLocalJSON(SETTINGS_KEY, settings)
  }, [ready, settings])

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeId) || sessions[0],
    [activeId, sessions]
  )
  const latestMessage = activeSession?.messages?.[activeSession.messages.length - 1]
  const isStreaming = latestMessage?.role === 'assistant' && latestMessage.streaming

  function resetComposer () {
    setInput('')
    setAttachments([])
    setAttachmentError('')
  }

  const createNewSession = useCallback(() => {
    const session = createSession()
    setSessions(current => [session, ...current].slice(0, MAX_LOCAL_SESSIONS))
    setActiveId(session.id)
    setMobilePanel('chat')
    setInput('')
    setAttachments([])
    setAttachmentError('')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  function selectSession (sessionId) {
    if (loading) return
    setActiveId(sessionId)
    setMobilePanel('chat')
    resetComposer()
  }

  function deleteSession (sessionId) {
    if (loading) return
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
    resetComposer()
  }

  function updateSession (sessionId, updater) {
    setSessions(current => current.map(session => (
      session.id === sessionId ? updater(session) : session
    )))
  }

  async function sendMessage () {
    const content = input.trim()
    if ((!content && !attachments.length) || loading || !activeSession) return

    const sessionId = activeSession.id
    const assistantId = createId()
    const userMessage = {
      id: createId(),
      role: 'user',
      content,
      attachments: attachments.map(attachment => ({ ...attachment }))
    }
    const history = activeSession.messages
      .filter(message => ['user', 'assistant'].includes(message.role))
      .map(toRequestMessage)
      .filter(message => message.content || message.attachments.length)
    const requestMessages = [...history, toRequestMessage(userMessage)]
    const controller = new AbortController()
    let latestContent = ''
    let latestSources = []
    let renderFrame = 0
    abortControllerRef.current = controller
    setInput('')
    setAttachments([])
    setAttachmentError('')
    setLoading(true)

    updateSession(sessionId, session => ({
      ...session,
      title: session.messages.length
        ? session.title
        : createTitle(content || createAttachmentTitle(userMessage.attachments)),
      messages: [
        ...session.messages,
        userMessage,
        { id: assistantId, role: 'assistant', content: '', streaming: true, attachments: [] }
      ],
      updatedAt: Date.now()
    }))

    function renderStreamText () {
      renderFrame = 0
      updateSession(sessionId, session => ({
        ...session,
        messages: session.messages.map(message => (
          message.id === assistantId
            ? { ...message, content: latestContent, streaming: true }
            : message
        )),
        updatedAt: Date.now()
      }))
    }

    function scheduleStreamText () {
      if (!renderFrame) renderFrame = window.requestAnimationFrame(renderStreamText)
    }

    function finishAssistantMessage (messageContent, { error = false, sources = latestSources } = {}) {
      if (renderFrame) {
        window.cancelAnimationFrame(renderFrame)
        renderFrame = 0
      }
      updateSession(sessionId, session => ({
        ...session,
        messages: session.messages.map(message => (
          message.id === assistantId
            ? {
                ...message,
                role: error && !messageContent ? 'error' : 'assistant',
                content: messageContent,
                streaming: false,
                sources
              }
            : message
        )),
        updatedAt: Date.now()
      }))
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: requestMessages,
          ...settings
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'AI 服务暂时不可用。')
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      if (contentType.includes('text/event-stream') && response.body) {
        let streamDone = false
        let streamError = ''
        await consumeSSE(response.body, event => {
          if (event.name === 'delta' && typeof event.data?.text === 'string') {
            latestContent += event.data.text
            scheduleStreamText()
          } else if (event.name === 'sources' && Array.isArray(event.data?.sources)) {
            latestSources = event.data.sources
          } else if (event.name === 'done') {
            streamDone = true
            if (Array.isArray(event.data?.sources)) latestSources = event.data.sources
          } else if (event.name === 'error') {
            streamError = String(event.data?.error || '模型回答意外中断。')
          }
        })

        if (streamError) throw new Error(streamError)
        if (!streamDone && !latestContent) throw new Error('模型回答意外中断，请稍后重试。')
        finishAssistantMessage(latestContent, { sources: latestSources })
      } else {
        const data = await response.json().catch(() => ({}))
        if (!data.message) throw new Error('模型没有返回可显示的内容。')
        latestContent = data.message
        latestSources = Array.isArray(data.sources) ? data.sources : []
        finishAssistantMessage(latestContent, { sources: latestSources })
      }
    } catch (error) {
      const message = error.name === 'AbortError'
        ? '已停止生成。'
        : error.message || '发送失败，请稍后重试。'
      const interruptedContent = latestContent
        ? latestContent + '\n\n> 回答中断：' + message
        : message
      finishAssistantMessage(interruptedContent, { error: true, sources: latestSources })
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setLoading(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  function stopResponse () {
    abortControllerRef.current?.abort()
  }

  function handleKeyDown (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  async function handleAttachmentFiles (event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || attaching || loading || !service.enabled) return

    let nextAttachments = [...attachments]
    setAttaching(true)
    setAttachmentError('')
    try {
      for (const file of files) {
        if (nextAttachments.length >= MAX_ATTACHMENTS) {
          throw new Error('每条消息最多添加 ' + MAX_ATTACHMENTS + ' 个附件。')
        }

        const image = isImageFile(file)
        const textExtension = getFileExtension(file.name)
        if (!image && !TEXT_EXTENSIONS.has(textExtension)) {
          throw new Error('仅支持图片和 TXT、Markdown、CSV、JSON、LOG、YAML 文本文件。')
        }

        if (image) {
          const conversationImageCount = countConversationImages(activeSession) +
            nextAttachments.filter(attachment => attachment.type === 'image').length
          if (conversationImageCount >= MAX_CONVERSATION_IMAGES) {
            throw new Error('一次对话最多发送 ' + MAX_CONVERSATION_IMAGES + ' 张图片。')
          }
          nextAttachments.push(await prepareImageAttachment(file))
        } else {
          nextAttachments.push(await prepareTextAttachment(file, textExtension))
        }
        setAttachments([...nextAttachments])
      }
      setAttachments(nextAttachments)
    } catch (error) {
      setAttachments(nextAttachments)
      setAttachmentError(error.message || '无法读取附件。')
    } finally {
      setAttaching(false)
    }
  }

  function removeAttachment (index) {
    setAttachments(current => current.filter((_, currentIndex) => currentIndex !== index))
    setAttachmentError('')
  }

  return (
    <section className="ai-workspace" aria-label="AI 工作间">
      <div className="ai-mobile-tabs" role="tablist" aria-label="AI 工作间视图">
        <MobileTab active={mobilePanel === 'sessions'} onClick={() => setMobilePanel('sessions')} icon={MessageSquareText}>会话</MobileTab>
        <MobileTab active={mobilePanel === 'chat'} onClick={() => setMobilePanel('chat')} icon={Bot}>对话</MobileTab>
        <MobileTab active={mobilePanel === 'settings'} onClick={() => setMobilePanel('settings')} icon={Settings2}>设置</MobileTab>
      </div>

      <aside className={'ai-sidebar' + (mobilePanel === 'sessions' ? ' ai-mobile-active' : '')}>
        <div className="ai-panel-heading">
          <div>
            <p className="ink-eyebrow">Ely</p>
            <h1>AI 工作间</h1>
          </div>
          <Bot className="h-5 w-5 text-[var(--ink-accent)]" aria-hidden="true" />
        </div>
        <button type="button" className="ink-command w-full" disabled={loading} onClick={createNewSession}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          新建本地会话
        </button>
        <div className="ai-session-list" aria-label="本地会话">
          {sessions.map(session => (
            <div key={session.id} className={'ai-session' + (session.id === activeSession?.id ? ' ai-session-active' : '')}>
              <button
                type="button"
                className="ai-session-select ink-focus"
                disabled={loading}
                onClick={() => selectSession(session.id)}
              >
                <span>{session.title}</span>
                <small>{formatSessionTime(session.updatedAt)}</small>
              </button>
              <button
                type="button"
                className="ai-icon-button ink-focus"
                aria-label={'删除会话：' + session.title}
                title="删除会话"
                disabled={loading}
                onClick={() => deleteSession(session.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div className="ai-privacy-note">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>文字会话只保存在此浏览器</span>
        </div>
      </aside>

      <div className={'ai-chat' + (mobilePanel === 'chat' ? ' ai-mobile-active' : '')}>
        <header className="ai-chat-header">
          <div>
            <p className="ink-eyebrow">当前会话</p>
            <h2>{activeSession?.title || '新会话'}</h2>
          </div>
          <div className={'ai-service-state' + (service.enabled ? ' ai-service-online' : '')}>
            {service.enabled ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            <span>{service.enabled ? service.displayName + ' · 可用' : '等待管理员启用 AI 服务'}</span>
          </div>
        </header>

        <div className="ai-messages" aria-live="polite">
          {!activeSession?.messages.length && (
            <div className="ai-empty-state">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
              <h2>从一个具体问题开始</h2>
              <p>可以询问站内文章，也可以附加图片或文本文件。开启博客检索后，回答会优先参考已发布文章并列出出处；图片在本机压缩后发送。</p>
            </div>
          )}
          {activeSession?.messages.map(message => (
            <article
              key={message.id}
              className={'ai-message ai-message-' + message.role + (message.streaming ? ' ai-message-streaming' : '')}
            >
              <div className="ai-message-role">
                {message.role === 'user' ? '你' : message.role === 'error' ? '状态' : service.displayName}
              </div>
              <div className="ai-message-content">
                {Boolean(message.attachments?.length) && (
                  <div className="ai-message-attachments">
                    {message.attachments.map((attachment, index) => (
                      <MessageAttachment key={attachment.name + '-' + index} attachment={attachment} />
                    ))}
                  </div>
                )}
                {message.role === 'assistant'
                  ? message.content
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
                    : <span className="ai-message-waiting">正在检索文章并整理回答</span>
                  : message.content ? <p>{message.content}</p> : null}
                {message.role === 'assistant' && Boolean(message.sources?.length) && (
                  <BlogSources sources={message.sources} />
                )}
              </div>
            </article>
          ))}
          {loading && !isStreaming && (
            <div className="ai-thinking">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在连接模型
            </div>
          )}
        </div>

        <div className="ai-composer">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.csv,.json,.log,.yaml,.yml"
            className="sr-only"
            onChange={handleAttachmentFiles}
          />
          {Boolean(attachments.length) && (
            <div className="ai-attachment-tray" aria-label="待发送附件">
              {attachments.map((attachment, index) => (
                <div key={attachment.name + '-' + index} className="ai-attachment-chip">
                  {attachment.type === 'image'
                    ? <img src={attachment.dataUrl} alt="" className="ai-attachment-thumb" />
                    : <FileText className="h-4 w-4" aria-hidden="true" />}
                  <span title={attachment.name}>{attachment.name}</span>
                  <small>{formatAttachmentSize(attachment)}</small>
                  <button
                    type="button"
                    className="ai-attachment-remove"
                    aria-label={'移除附件：' + attachment.name}
                    onClick={() => removeAttachment(index)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachmentError && <p className="ai-composer-error">{attachmentError}</p>}
          <div className="ai-composer-row">
            <button
              type="button"
              className="ai-attach-button ink-focus"
              aria-label="添加图片或文本文件"
              title="添加图片或文本文件"
              disabled={!service.enabled || loading || attaching || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
            >
              {attaching ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
            </button>
            <textarea
              ref={inputRef}
              rows={3}
              value={input}
              maxLength={12000}
              placeholder={service.enabled ? '输入问题；也可只发送图片或文本附件。Shift + Enter 换行' : '管理员启用 AI 服务后即可开始会话'}
              aria-label="输入消息"
              disabled={!service.enabled || loading}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="ai-send-button ink-focus"
              aria-label={loading ? '停止生成' : '发送消息'}
              title={loading ? '停止生成' : '发送消息'}
              disabled={!service.enabled || attaching || (!loading && !input.trim() && !attachments.length)}
              onClick={loading ? stopResponse : sendMessage}
            >
              {loading
                ? <Square className="h-4 w-4" aria-hidden="true" />
                : <Send className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
          <p className="ai-composer-note">图片最多 4 张，单张压缩至 700 KB 内；每条消息最多 3 个附件。开启博客检索后，仅保存文章标题与链接到本地历史。</p>
        </div>
      </div>

      <aside className={'ai-settings' + (mobilePanel === 'settings' ? ' ai-mobile-active' : '')}>
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
          <span>额外文章上下文</span>
          <textarea
            rows={5}
            maxLength={4000}
            placeholder="可选：粘贴本次会话额外需要引用的段落"
            value={settings.articleContext}
            onChange={event => setSettings(current => ({ ...current, articleContext: event.target.value }))}
          />
        </label>
        <label className="ai-toggle-field">
          <span>
            <strong>检索站内博客</strong>
            <small>从 Notion 与 GitHub Issue 文章中查找相关内容，并在回答下列出来源。</small>
          </span>
          <input
            type="checkbox"
            checked={settings.useBlogContext !== false}
            onChange={event => setSettings(current => ({ ...current, useBlogContext: event.target.checked }))}
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
        <p className="ai-settings-footnote">管理员配置整份 AI 设置后，使用 AES-256-GCM 加密保存在服务端；接口地址、模型与 Key 都不会回传到浏览器。会话仍只保存在此浏览器。</p>
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

function MessageAttachment ({ attachment }) {
  if (attachment.type === 'image') {
    return (
      <div className="ai-history-attachment ai-history-image">
        {attachment.dataUrl
          ? <img src={attachment.dataUrl} alt={attachment.name} loading="lazy" />
          : <span>图片已不在本地内存中</span>}
        <small>{attachment.name}</small>
      </div>
    )
  }

  return (
    <div className="ai-history-attachment">
      <FileText className="h-4 w-4" aria-hidden="true" />
      <span>{attachment.name}</span>
      <small>{formatAttachmentSize(attachment)}</small>
    </div>
  )
}

function BlogSources ({ sources }) {
  const uniqueSources = sources
    .filter(source => source?.title && source?.url)
    .filter((source, index, list) => list.findIndex(item => item.url === source.url) === index)

  if (!uniqueSources.length) return null

  return (
    <section className="ai-message-sources" aria-label="参考博客文章">
      <div className="ai-message-sources-label">
        <BookOpenText className="h-4 w-4" aria-hidden="true" />
        参考博客文章
      </div>
      <div className="ai-source-list">
        {uniqueSources.map(source => (
          <a
            key={source.id || source.url}
            className="ai-source-card ink-focus"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            <span>
              <strong>{source.title}</strong>
              <small>{source.sourceType === 'github' ? 'GitHub Issue' : 'Notion'} 文章</small>
            </span>
          </a>
        ))}
      </div>
    </section>
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
  return Date.now() + '-' + Math.random().toString(16).slice(2)
}

function createTitle (content) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim()
  return normalized.length > 24 ? normalized.slice(0, 24) + '…' : normalized || '新会话'
}

function createAttachmentTitle (attachments) {
  const imageCount = attachments.filter(attachment => attachment.type === 'image').length
  const fileCount = attachments.length - imageCount
  return [imageCount ? imageCount + ' 张图片' : '', fileCount ? fileCount + ' 个文件' : '']
    .filter(Boolean)
    .join(' · ') || '附件会话'
}

function toRequestMessage (message) {
  const requestAttachments = (message.attachments || [])
    .filter(attachment => attachment.type === 'image' ? attachment.dataUrl : attachment.content)
    .map(attachment => attachment.type === 'image'
      ? {
          type: 'image',
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataUrl: attachment.dataUrl,
          size: attachment.size
        }
      : {
          type: 'text',
          name: attachment.name,
          mimeType: attachment.mimeType,
          content: attachment.content,
          size: attachment.size
        })

  return {
    role: message.role,
    content: message.content || '',
    attachments: requestAttachments
  }
}

function serializeSessions (sessions) {
  return sessions.map(session => ({
    ...session,
    messages: session.messages.map(message => ({
      ...message,
      streaming: false,
      attachments: (message.attachments || []).map(({ type, name, mimeType, size }) => ({
        type,
        name,
        mimeType,
        size
      })),
      sources: (message.sources || []).map(({ id, title, url, sourceType, updatedAt }) => ({
        id,
        title,
        url,
        sourceType,
        updatedAt
      }))
    }))
  }))
}

function readLocalJSON (key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeLocalJSON (key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing and storage quotas must not break the chat.
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

function isImageFile (file) {
  return IMAGE_TYPES.has(String(file.type || '').toLowerCase())
}

function getFileExtension (fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || ''
}

function countConversationImages (session) {
  return (session?.messages || []).reduce((total, message) => (
    total + (message.attachments || []).filter(attachment => attachment.type === 'image' && attachment.dataUrl).length
  ), 0)
}

function inferTextMimeType (extension) {
  if (extension === 'json') return 'application/json'
  if (extension === 'csv') return 'text/csv'
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'yaml' || extension === 'yml') return 'text/yaml'
  return 'text/plain'
}

async function prepareTextAttachment (file, extension) {
  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error(file.name + ' 超过 256 KB，无法作为文本附件读取。')
  const content = (await file.text()).replace(/\u0000/gu, '').trim()
  if (!content) throw new Error(file.name + ' 是空文件。')
  if (content.length > MAX_TEXT_ATTACHMENT_LENGTH) {
    throw new Error(file.name + ' 的文本超过 ' + MAX_TEXT_ATTACHMENT_LENGTH.toLocaleString('zh-CN') + ' 字符。')
  }
  const mimeType = TEXT_MIME_TYPES.has(file.type) ? file.type : inferTextMimeType(extension)
  return {
    type: 'text',
    name: file.name || '文本文件',
    mimeType,
    content,
    size: content.length
  }
}

async function prepareImageAttachment (file) {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) throw new Error('源图片不能超过 12 MB。')
  if (file.type === 'image/gif') {
    if (file.size > TARGET_IMAGE_BYTES) throw new Error('GIF 不能超过 700 KB，请压缩或转换为其他格式。')
    return {
      type: 'image',
      name: file.name || 'image.gif',
      mimeType: 'image/gif',
      dataUrl: await readFileAsDataUrl(file),
      size: file.size
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理图片。')

    let maxDimension = 1600
    let quality = 0.82
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob && blob.size <= TARGET_IMAGE_BYTES) {
        return {
          type: 'image',
          name: replaceImageExtension(file.name),
          mimeType: 'image/webp',
          dataUrl: await readBlobAsDataUrl(blob),
          size: blob.size
        }
      }
      maxDimension = Math.round(maxDimension * 0.82)
      quality = Math.max(0.48, quality - 0.07)
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  throw new Error('图片压缩后仍超过 700 KB，请换一张尺寸更小的图片。')
}

function replaceImageExtension (fileName) {
  const base = String(fileName || 'image').replace(/\.[^.]+$/, '') || 'image'
  return base + '.webp'
}

function loadImage (src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取这张图片。'))
    image.src = src
  })
}

function canvasToBlob (canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

function readFileAsDataUrl (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取图片文件。'))
    reader.readAsDataURL(file)
  })
}

function readBlobAsDataUrl (blob) {
  return readFileAsDataUrl(blob)
}

function formatAttachmentSize (attachment) {
  return attachment?.type === 'text'
    ? formatCharacterCount(attachment.size)
    : formatFileSize(attachment?.size)
}

function formatCharacterCount (characters) {
  const size = Number(characters)
  if (!Number.isFinite(size) || size <= 0) return ''
  return size.toLocaleString('zh-CN') + ' 字符'
}

function formatFileSize (bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return size + ' B'
  return (size / 1024).toFixed(size < 100 * 1024 ? 1 : 0) + ' KB'
}

async function consumeSSE (body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = drainSSEBlocks(buffer, onEvent)
  }

  buffer += decoder.decode()
  if (buffer.trim()) emitSSEBlock(buffer, onEvent)
}

function drainSSEBlocks (buffer, onEvent) {
  let separator
  while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
    const block = buffer.slice(0, separator)
    buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, '')
    emitSSEBlock(block, onEvent)
  }
  return buffer
}

function emitSSEBlock (block, onEvent) {
  let name = 'message'
  const dataLines = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (!dataLines.length) return
  const raw = dataLines.join('\n')
  if (raw === '[DONE]') {
    onEvent({ name: 'done', data: { done: true } })
    return
  }
  try {
    onEvent({ name, data: JSON.parse(raw) })
  } catch {
    onEvent({ name, data: { text: raw } })
  }
}
