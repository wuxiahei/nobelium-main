import { useEffect, useMemo, useRef, useState } from 'react'
import ActionFeedback from '@/components/ActionFeedback'
import { filterEditorCommands, getSlashCommand, getEditorCommandBlock } from '@/lib/editor-commands.mjs'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import AdminImageLibrary from '@/components/AdminImageLibrary'
import { extractMarkdownHeadings } from '@/lib/markdown-outline.mjs'

const BLOCK_ACTIONS = [
  { value: 'h1', label: '一级标题' },
  { value: 'h2', label: '二级标题' },
  { value: 'h3', label: '三级标题' },
  { value: 'bullet', label: '无序列表' },
  { value: 'ordered', label: '有序列表' },
  { value: 'task', label: '任务清单' },
  { value: 'quote', label: '引用' },
  { value: 'code', label: '代码块' },
  { value: 'table', label: '表格' },
  { value: 'fold', label: '折叠块' },
  { value: 'formula', label: '数学公式' },
  { value: 'divider', label: '分隔线' }
]

const IMAGE_POSITIONS = [
  { value: 'center', label: '居中' },
  { value: 'left', label: '左侧环绕' },
  { value: 'right', label: '右侧环绕' },
  { value: 'full', label: '通栏' }
]

const IMAGE_WIDTHS = [25, 40, 50, 65, 80, 100]
const MODES = [
  { value: 'edit', label: '编辑' },
  { value: 'split', label: '分屏' },
  { value: 'preview', label: '预览' }
]
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default function AdminMarkdownEditor ({ value, onChange, maxLength = 60000, source = 'github' }) {
  const editorRef = useRef(null)
  const textareaRef = useRef(null)
  const librarySelectionRef = useRef(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [slash, setSlash] = useState(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [selectionTools, setSelectionTools] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState('')
  const composingRef = useRef(false)
  const dismissedSlashRef = useRef(null)
  const contentRef = useRef('')
  const uploadControllerRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageSelectionRef = useRef(null)
  const [mode, setMode] = useState(source === 'notion' ? 'edit' : 'split')
  const [imageOpen, setImageOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imagePosition, setImagePosition] = useState('center')
  const [imageWidth, setImageWidth] = useState(80)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [outlineJump, setOutlineJump] = useState(null)
  const content = String(value || '')
  contentRef.current = content
  const slashCommands = slash ? filterEditorCommands(slash.query) : []
  const stats = getContentStats(content)
  const outline = useMemo(() => extractMarkdownHeadings(content), [content])

  useEffect(() => {
    if (!outlineJump) return
    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      const position = Math.max(0, Math.min(outlineJump.position, content.length))
      const lineCount = Math.max(1, content.slice(0, position).split('\n').length)
      const totalLines = Math.max(1, content.split('\n').length)
      const scrollRange = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
      textarea.focus()
      textarea.setSelectionRange(position, position)
      textarea.scrollTop = Math.max(0, Math.round((lineCount - 1) / Math.max(1, totalLines - 1) * scrollRange - textarea.clientHeight * 0.2))
    })
    return () => cancelAnimationFrame(frame)
  }, [outlineJump, content])

  useEffect(() => () => uploadControllerRef.current?.abort(), [])

  useEffect(() => {
    const closeTools = () => { setSlash(null); setSelectionTools(null) }
    window.addEventListener('resize', closeTools)
    return () => window.removeEventListener('resize', closeTools)
  }, [])

  useEffect(() => {
    editorRef.current?.querySelector('.editor-command-option.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [slashIndex, slash?.query])

  function updateSelection (textarea) {
    if (composingRef.current) return
    const { selectionStart: start, selectionEnd: end } = textarea
    const next = getSlashCommand(textarea.value, start, end)
    if (start === end && (!next || dismissedSlashRef.current === next.start)) {
      setSlash(null)
      setSelectionTools(null)
      return
    }
    const position = caretPosition(textarea, start)
    if (next && dismissedSlashRef.current !== next.start) {
      if (slash?.query !== next.query || slash?.start !== next.start) setSlashIndex(0)
      setSlash({ ...next, ...position })
    } else setSlash(null)
    setSelectionTools(start !== end ? { start, end, ...position } : null)
  }

  function handleTextChange (event) {
    contentRef.current = event.target.value
    onChange(event.target.value)
    dismissedSlashRef.current = null
    updateSelection(event.target)
  }

  function chooseCommand (command) {
    if (!command || !slash) return
    const selection = { start: slash.start, end: slash.end }
    dismissedSlashRef.current = slash.start
    setSlash(null)
    if (command.value === 'image') {
      imageSelectionRef.current = selection
      setImageOpen(true)
      return
    }
    insertBlock(getEditorCommandBlock(command, source), command.marker || '', selection)
  }

  function emitValue (nextValue, selectionStart, selectionEnd) {
    if (nextValue.length > maxLength) {
      setUploadError('插入内容后将超过正文长度上限。')
      return false
    }
    contentRef.current = nextValue
    onChange(nextValue)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(selectionStart, selectionEnd)
    })
    return true
  }

  function getSelection () {
    const textarea = textareaRef.current
    if (!textarea) return { start: content.length, end: content.length }
    return { start: textarea.selectionStart, end: textarea.selectionEnd }
  }

  function replaceSelection (before, after, placeholder = '') {
    const textarea = textareaRef.current
    const start = textarea ? textarea.selectionStart : content.length
    const end = textarea ? textarea.selectionEnd : content.length
    if (!textarea) setMode('edit')
    const selected = content.slice(start, end)
    const inner = selected || placeholder
    const insertion = before + inner + after
    const nextValue = content.slice(0, start) + insertion + content.slice(end)
    const innerStart = start + before.length
    emitValue(nextValue, innerStart, innerStart + inner.length)
  }

  function prefixSelectedLines (prefix, placeholder = '标题文字') {
    const textarea = textareaRef.current
    const start = textarea ? textarea.selectionStart : content.length
    const end = textarea ? textarea.selectionEnd : content.length
    if (!textarea) setMode('edit')
    const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const nextLine = content.indexOf('\n', end)
    const lineEnd = nextLine < 0 ? content.length : nextLine
    const source = content.slice(lineStart, lineEnd) || placeholder
    const replaced = source.split('\n').map(line => prefix + line).join('\n')
    const nextValue = content.slice(0, lineStart) + replaced + content.slice(lineEnd)
    const selectionStart = lineStart + prefix.length
    emitValue(nextValue, selectionStart, lineStart + replaced.length)
  }

  function insertBlock (block, marker = '', explicitSelection = null) {
    const start = explicitSelection?.start ?? (textareaRef.current ? textareaRef.current.selectionStart : content.length)
    const end = explicitSelection?.end ?? (textareaRef.current ? textareaRef.current.selectionEnd : content.length)
    if (!textareaRef.current) setMode(current => current === 'preview' ? 'split' : current)
    const before = contentRef.current.slice(0, start)
    const after = contentRef.current.slice(end)
    const prefix = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const suffix = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const nextValue = before + prefix + block + suffix + after
    const blockStart = start + prefix.length
    const markerOffset = marker ? block.indexOf(marker) : -1
    const selectionStart = markerOffset >= 0 ? blockStart + markerOffset : blockStart + block.length
    const selectionEnd = markerOffset >= 0 ? selectionStart + marker.length : selectionStart
    setImageOpen(false)
    return emitValue(nextValue, selectionStart, selectionEnd)
  }

  function insertHeading (level) {
    prefixSelectedLines('#'.repeat(level) + ' ', '标题文字')
  }

  function insertLink () {
    replaceSelection('[', '](https://example.com)', '链接文字')
  }

  function handleBlockAction (event) {
    const action = event.target.value
    event.target.value = ''
    if (action === 'h1') return insertHeading(1)
    if (action === 'h2') return insertHeading(2)
    if (action === 'h3') return insertHeading(3)
    if (action === 'bullet') return insertBlock('- 列表项\n- 列表项', '列表项')
    if (action === 'ordered') return insertBlock('1. 列表项\n2. 列表项', '列表项')
    if (action === 'task') return insertBlock('- [ ] 待办事项\n- [ ] 另一项', '待办事项')
    if (action === 'quote') return insertBlock('> 引用内容', '引用内容')
    if (action === 'code') return insertBlock('```js\n在这里写代码\n```', '在这里写代码')
    if (action === 'table') {
      return insertBlock('| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |', '内容')
    }
    if (action === 'fold') {
      return insertBlock(getEditorCommandBlock({ value: 'fold', block: '> [!fold] 折叠标题\n>\n> 这里写折叠内容。' }, source), '折叠标题')
    }
    if (action === 'formula') return insertBlock('$$\nE = mc^2\n$$', 'E = mc^2')
    if (action === 'divider') return insertBlock('---')
  }

  function buildImageMarkdown (url, alt, position = imagePosition, width = imageWidth) {
    const safeAlt = String(alt || '图片说明').replace(/[[\]]/g, '')
    const safeUrl = String(url || '').trim().replace(/\s/g, '%20').replace(/\)/g, '%29')
    if (source === 'notion') return '![' + safeAlt + '](' + safeUrl + ')'
    const title = position === 'full' ? 'full 100%' : position + ' ' + width + '%'
    return '![' + safeAlt + '](' + safeUrl + ' "' + title + '")'
  }

  function insertImage () {
    const url = imageUrl.trim()
    if (!url) return
    const alt = imageAlt.trim() || '图片说明'
    const inserted = insertBlock(buildImageMarkdown(url, alt), alt, imageSelectionRef.current)
    if (!inserted) return
    imageSelectionRef.current = null
    setImageUrl('')
    setImageAlt('')
  }

  function openImagePicker () {
    imageSelectionRef.current = imageSelectionRef.current || getSelection()
    fileInputRef.current?.click()
  }

  function openImageLibrary () {
    librarySelectionRef.current = getSelection()
    setImageOpen(false)
    setLibraryOpen(true)
  }

  function insertLibraryImage (image) {
    const alt = getImageAlt(image.pathname)
    const inserted = insertBlock(buildImageMarkdown(image.url, alt), alt, librarySelectionRef.current || getSelection())
    if (!inserted) return
    librarySelectionRef.current = null
    setLibraryOpen(false)
  }

  function handleImageFileInput (event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const selection = imageSelectionRef.current || getSelection()
    imageSelectionRef.current = null
    uploadAndInsertImage(file, selection)
  }

  function handlePaste (event) {
    const items = Array.from(event.clipboardData?.items || [])
    const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    event.preventDefault()
    uploadAndInsertImage(file, getSelection())
  }

  function handleDragOver (event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave (event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false)
  }

  function handleDrop (event) {
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    event.preventDefault()
    setDragActive(false)
    uploadAndInsertImage(file, getSelection())
  }

  async function uploadAndInsertImage (file, selection) {
    if (uploading) return
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError('仅支持 JPEG、PNG、WebP 或 GIF 图片。')
      return
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setUploadError('源图片不能超过 25 MB。')
      return
    }

    const placement = { position: imagePosition, width: imageWidth }
    const alt = getImageAlt(file.name)
    const controller = new AbortController()
    uploadControllerRef.current = controller
    setUploading(true)
    setImageOpen(false)
    setLibraryOpen(false)
    setUploadError('')
    setUploadSuccess('')
    setSlash(null)
    setSelectionTools(null)
    try {
      const dataUrl = await prepareImageFile(file)
      if (controller.signal.aborted) return
      const result = await requestJson('/api/admin/upload-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, fileName: file.name }),
        signal: controller.signal
      })
      if (controller.signal.aborted) return
      if (insertBlock(buildImageMarkdown(result.url, alt, placement.position, placement.width), alt, selection)) setUploadSuccess('图片已上传并插入正文。')
    } catch (error) {
      if (controller.signal.aborted) return
      setUploadError(error.message || '图片上传失败，也可以继续使用公开图片 URL。')
    } finally {
      if (!controller.signal.aborted) setUploading(false)
    }
  }

  function jumpToHeading (heading) {
    setOutlineJump({ ...heading, nonce: Date.now() })
    setMode(current => current === 'preview' ? 'split' : current)
  }

  function handleKeyDown (event) {
    if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) return
    if (slash) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissedSlashRef.current = slash.start
        setSlash(null)
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (slashCommands.length) setSlashIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + slashCommands.length) % slashCommands.length)
        return
      }
      if (event.key === 'Enter' && slashCommands.length) {
        event.preventDefault()
        chooseCommand(slashCommands[slashIndex] || slashCommands[0])
        return
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      replaceSelection('  ', '', '')
      return
    }

    if (!(event.metaKey || event.ctrlKey)) return
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      replaceSelection('**', '**', '粗体文字')
    } else if (key === 'i') {
      event.preventDefault()
      replaceSelection('*', '*', '斜体文字')
    } else if (key === 'k') {
      event.preventDefault()
      insertLink()
    }
  }

  return (
    <div ref={editorRef} className="admin-editor" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setSlash(null); setSelectionTools(null) }
    }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleImageFileInput}
      />
      <fieldset disabled={uploading} className="admin-editor-toolbar" aria-label="Markdown 编辑工具栏">
        <div className="admin-editor-toolbar-group">
          <select className="admin-editor-select" defaultValue="" onChange={handleBlockAction} aria-label="插入标题或内容块">
            <option value="" disabled>插入标题 / 内容块</option>
            {BLOCK_ACTIONS.map(action => (
              <option key={action.value} value={action.value}>{action.label}</option>
            ))}
          </select>
          <button type="button" className="admin-editor-tool" title="粗体 (Ctrl+B)" onClick={() => replaceSelection('**', '**', '粗体文字')}>B</button>
          <button type="button" className="admin-editor-tool italic" title="斜体 (Ctrl+I)" onClick={() => replaceSelection('*', '*', '斜体文字')}>I</button>
          <button type="button" className="admin-editor-tool line-through" title="删除线" onClick={() => replaceSelection('~~', '~~', '删除文字')}>S</button>
          <button type="button" className="admin-editor-tool" title="行内代码" onClick={() => replaceSelection('`', '`', '代码')}>{'</>'}</button>
          <button type="button" className="admin-editor-tool" title="链接 (Ctrl+K)" onClick={insertLink}>链接</button>
        </div>

        <div className="admin-editor-toolbar-group">
          <button type="button" className="admin-editor-tool" disabled={uploading} onClick={openImagePicker}>{uploading ? '上传中...' : '上传图片'}</button>
          <button type="button" className="admin-editor-tool" onClick={() => { imageSelectionRef.current = getSelection(); setImageOpen(current => !current) }}>{source === 'notion' ? '插入图片链接' : '图片摆放'}</button>
          <button type="button" className="admin-editor-tool" onClick={openImageLibrary}>图片库</button>
          <button type="button" className="admin-editor-tool" onClick={() => insertBlock(getEditorCommandBlock({ value: 'fold', block: '> [!fold] 折叠标题\n>\n> 这里写折叠内容。' }, source), '折叠标题')}>折叠块</button>
          <div className="admin-editor-modes" role="group" aria-label="编辑模式">
            {MODES.map(item => (
              <button
                key={item.value}
                type="button"
                className={'admin-editor-mode' + (mode === item.value ? ' admin-editor-mode-active' : '')}
                aria-pressed={mode === item.value}
                onClick={() => setMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {source === 'notion' && <p className="admin-draft-status">直接修改文字即可；折叠块、图片和链接预览等 Notion 格式会自动保留，不需要手动补 Markdown 标签。块本身的增删或属性调整请前往 Notion。</p>}
      <ActionFeedback state={uploadError ? 'error' : uploading ? 'loading' : 'success'}>
        {uploadError || (uploading ? '正在压缩并上传图片…' : uploadSuccess)}
      </ActionFeedback>

      {libraryOpen && (
        <AdminImageLibrary
          content={content}
          onInsert={insertLibraryImage}
          onClose={() => {
            librarySelectionRef.current = null
            setLibraryOpen(false)
          }}
        />
      )}

      {imageOpen && (
        <div className="admin-image-panel">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-[var(--ink-muted)]">
              <span>图片 URL</span>
              <input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://.../image.jpg" className="h-10 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-sm text-[var(--ink-main)] outline-none focus:border-[var(--ink-accent)]" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-[var(--ink-muted)]">
              <span>图片说明 / alt</span>
              <input value={imageAlt} onChange={event => setImageAlt(event.target.value)} placeholder="描述图片内容" className="h-10 rounded-sm border border-[var(--ink-line)] bg-[var(--ink-paper)] px-3 text-sm text-[var(--ink-main)] outline-none focus:border-[var(--ink-accent)]" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-medium text-[var(--ink-muted)]">
              <span>位置</span>
              <select disabled={source === 'notion'} value={imagePosition} onChange={event => setImagePosition(event.target.value)} className="admin-editor-select">
                {IMAGE_POSITIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-[var(--ink-muted)]">
              <span>宽度</span>
              <select value={imagePosition === 'full' ? 100 : imageWidth} disabled={source === 'notion' || imagePosition === 'full'} onChange={event => setImageWidth(Number(event.target.value))} className="admin-editor-select">
                {IMAGE_WIDTHS.map(width => <option key={width} value={width}>{width}%</option>)}
              </select>
            </label>
            <button type="button" disabled={uploading} onClick={openImagePicker} className="ink-command disabled:opacity-50">{uploading ? '上传中...' : '上传本地图片'}</button>
            <button type="button" disabled={!imageUrl.trim()} onClick={insertImage} className="ink-command ink-command-primary disabled:opacity-50">插入 URL</button>
            <button type="button" onClick={() => { imageSelectionRef.current = null; setImageOpen(false) }} className="ink-command">取消</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">支持 JPEG、PNG、WebP、GIF。可直接在编辑区粘贴图片或拖入文件；图片会压缩到 3 MB 内并上传到 Vercel Blob。</p>
        </div>
      )}

      <div className="admin-editor-body">
        <div
          className={'admin-editor-workspace admin-editor-workspace-' + mode + (dragActive ? ' admin-editor-workspace-dragging' : '')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {mode !== 'preview' && (
            <div className="admin-editor-input">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelect={event => updateSelection(event.target)}
                onScroll={() => { setSlash(null); setSelectionTools(null) }}
                onCompositionStart={() => { composingRef.current = true; setSlash(null); setSelectionTools(null) }}
                onCompositionEnd={event => { composingRef.current = false; updateSelection(event.target) }}
                disabled={uploading}
                aria-controls={slash ? 'editor-command-menu' : undefined}
                aria-autocomplete="list"
                aria-activedescendant={slash && slashCommands.length ? 'editor-command-' + (slashCommands[slashIndex] || slashCommands[0]).value : undefined}
                maxLength={maxLength}
                rows={26}
                spellCheck="false"
                aria-label="Markdown 正文"
                className="admin-editor-textarea"
              />
              {slash && (
                <div className="editor-command-menu" style={{ top: slash.menuTop, left: slash.left }}>
                  <div className="editor-command-hint">插入内容 · ↑↓ 选择 · Enter 插入 · Esc 关闭</div>
                  <div id="editor-command-menu" role="listbox" aria-label="快捷插入内容">
                    {slashCommands.map((command, index) => (
                      <button key={command.value} id={'editor-command-' + command.value} type="button" role="option" aria-selected={index === slashIndex} className={'editor-command-option' + (index === slashIndex ? ' is-active' : '')} onMouseDown={event => event.preventDefault()} onClick={() => chooseCommand(command)}>{command.label}<span>/{command.value}</span></button>
                    ))}
                    {!slashCommands.length && <p className="editor-command-hint">没有匹配项，按 Esc 继续输入</p>}
                  </div>
                </div>
              )}
              {selectionTools && !slash && (
                <div className="editor-selection-tools" role="toolbar" aria-label="选中文字工具" style={{ top: Math.max(0, selectionTools.top - 64), left: selectionTools.left }} onMouseDown={event => event.preventDefault()}>
                  <button type="button" className="ink-command" onClick={() => replaceSelection('**', '**')}>加粗</button>
                  <button type="button" className="ink-command" onClick={() => replaceSelection('*', '*')}>斜体</button>
                  <button type="button" className="ink-command" onClick={insertLink}>链接</button>
                </div>
              )}
            </div>
          )}
          {mode !== 'edit' && (
            <div className="admin-editor-preview">
              <div className="admin-editor-preview-label">预览</div>
              <div className="admin-editor-preview-body">
                <MarkdownRenderer content={content} />
              </div>
            </div>
          )}
          {dragActive && <div className="admin-editor-drop-hint">松开即可上传图片</div>}
        </div>

        <aside className="admin-editor-outline" aria-label="文章标题大纲">
          <div className="admin-editor-outline-header">
            <span>标题大纲</span>
            <span>{outline.length}</span>
          </div>
          {outline.length ? (
            <nav className="admin-editor-outline-list">
              {outline.map((heading, index) => (
                <button
                  key={heading.position + '-' + index}
                  type="button"
                  className={'admin-editor-outline-item admin-editor-outline-level-' + heading.level}
                  style={{ paddingLeft: (0.7 + Math.min(heading.level - 1, 4) * 0.55) + 'rem' }}
                  title={heading.text}
                  onClick={() => jumpToHeading(heading)}
                >
                  {heading.text}
                </button>
              ))}
            </nav>
          ) : (
            <p className="admin-editor-outline-empty">添加标题后显示大纲</p>
          )}
        </aside>
      </div>

      <div className="admin-editor-footer">
        <span>{stats.characters.toLocaleString('zh-CN')} / {maxLength.toLocaleString('zh-CN')} 字符</span>
        <span>{stats.lines} 行 · {stats.images} 张图片 · {stats.folds} 个折叠块 · {outline.length} 个标题</span>
        <span className="admin-editor-shortcut">空行输入 / 插入内容 · Ctrl+B 粗体 · Ctrl+K 链接</span>
      </div>
    </div>
  )
}

function getContentStats (content) {
  const lines = content ? content.split('\n').length : 0
  const images = (content.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length
  const markdownFolds = (content.match(/^>\s*\[!fold\]/gim) || []).length
  const notionFolds = (content.match(/<toggle\b/gi) || []).length
  return { characters: content.length, lines, images, folds: markdownFolds + notionFolds }
}

function getImageAlt (fileName) {
  return String(fileName || '图片')
    .replace(/\.[^.]+$/, '')
    .replace(/[[\]]/g, '')
    .trim()
    .slice(0, 120) || '图片'
}

async function prepareImageFile (file) {
  if (file.type === 'image/gif') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('GIF 不能超过 3 MB。')
    return readFileAsDataUrl(file)
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理图片。')

    let maxDimension = 1800
    let quality = 0.84
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob && blob.size <= MAX_IMAGE_BYTES) return readBlobAsDataUrl(blob)
      maxDimension = Math.round(maxDimension * 0.8)
      quality = Math.max(0.55, quality - 0.08)
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  throw new Error('图片压缩后仍超过 3 MB，请换一张尺寸更小的图片。')
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

function caretPosition (textarea, position) {
  const mirror = document.createElement('div')
  const computed = getComputedStyle(textarea)
  for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'boxSizing', 'tabSize', 'wordBreak']) mirror.style[key] = computed[key]
  Object.assign(mirror.style, { position: 'fixed', left: '-10000px', top: '0', width: textarea.clientWidth + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = textarea.value.slice(position) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const visibleBottom = Math.max(48, Math.min(textarea.clientHeight, window.innerHeight - textarea.getBoundingClientRect().top))
  const top = Math.max(4, Math.min(textarea.clientHeight - 48, marker.offsetTop - textarea.scrollTop + (parseFloat(computed.lineHeight) || 24)))
  const menuTop = Math.max(4, Math.min(visibleBottom - 270, top))
  const left = Math.max(4, Math.min(textarea.clientWidth - 285, marker.offsetLeft - textarea.scrollLeft))
  mirror.remove()
  return { top, left, menuTop }
}
