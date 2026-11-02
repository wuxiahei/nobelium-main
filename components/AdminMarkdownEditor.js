import { useRef, useState } from 'react'
import MarkdownRenderer from '@/components/MarkdownRenderer'

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

export default function AdminMarkdownEditor ({ value, onChange, maxLength = 60000 }) {
  const textareaRef = useRef(null)
  const [mode, setMode] = useState('split')
  const [imageOpen, setImageOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imagePosition, setImagePosition] = useState('center')
  const [imageWidth, setImageWidth] = useState(80)
  const content = String(value || '')
  const stats = getContentStats(content)

  function emitValue (nextValue, selectionStart, selectionEnd) {
    onChange(nextValue)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(selectionStart, selectionEnd)
    })
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

  function insertBlock (block, marker = '') {
    const textarea = textareaRef.current
    const start = textarea ? textarea.selectionStart : content.length
    const end = textarea ? textarea.selectionEnd : content.length
    if (!textarea) setMode('edit')
    const before = content.slice(0, start)
    const after = content.slice(end)
    const prefix = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const suffix = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const nextValue = before + prefix + block + suffix + after
    const blockStart = start + prefix.length
    const markerOffset = marker ? block.indexOf(marker) : -1
    const selectionStart = markerOffset >= 0 ? blockStart + markerOffset : blockStart + block.length
    const selectionEnd = markerOffset >= 0 ? selectionStart + marker.length : selectionStart
    setImageOpen(false)
    emitValue(nextValue, selectionStart, selectionEnd)
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
      return insertBlock('> [!fold] 折叠标题\n>\n> 这里写折叠内容。', '折叠标题')
    }
    if (action === 'formula') return insertBlock('$$\nE = mc^2\n$$', 'E = mc^2')
    if (action === 'divider') return insertBlock('---')
  }

  function insertImage () {
    const url = imageUrl.trim()
    if (!url) return
    const alt = (imageAlt.trim() || '图片说明').replace(/[[\]]/g, '')
    const safeUrl = url.replace(/\s/g, '%20').replace(/\)/g, '%29')
    const title = imagePosition === 'full' ? 'full 100%' : imagePosition + ' ' + imageWidth + '%'
    insertBlock('![' + alt + '](' + safeUrl + ' "' + title + '")', alt)
    setImageUrl('')
    setImageAlt('')
  }

  function handleKeyDown (event) {
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
    <div className="admin-editor">
      <div className="admin-editor-toolbar" aria-label="Markdown 编辑工具栏">
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
          <button type="button" className="admin-editor-tool" onClick={() => setImageOpen(current => !current)}>图片摆放</button>
          <button type="button" className="admin-editor-tool" onClick={() => insertBlock('> [!fold] 折叠标题\n>\n> 这里写折叠内容。', '折叠标题')}>折叠块</button>
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
      </div>

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
              <select value={imagePosition} onChange={event => setImagePosition(event.target.value)} className="admin-editor-select">
                {IMAGE_POSITIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-[var(--ink-muted)]">
              <span>宽度</span>
              <select value={imagePosition === 'full' ? 100 : imageWidth} disabled={imagePosition === 'full'} onChange={event => setImageWidth(Number(event.target.value))} className="admin-editor-select">
                {IMAGE_WIDTHS.map(width => <option key={width} value={width}>{width}%</option>)}
              </select>
            </label>
            <button type="button" disabled={!imageUrl.trim()} onClick={insertImage} className="ink-command ink-command-primary disabled:opacity-50">插入图片</button>
            <button type="button" onClick={() => setImageOpen(false)} className="ink-command">取消</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">图片需使用公开 URL；左右位置会形成图文环绕，通栏占满正文宽度。</p>
        </div>
      )}

      <div className={'admin-editor-workspace admin-editor-workspace-' + mode}>
        {mode !== 'preview' && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={event => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            rows={26}
            spellCheck="false"
            aria-label="Markdown 正文"
            className="admin-editor-textarea"
          />
        )}
        {mode !== 'edit' && (
          <div className="admin-editor-preview">
            <div className="admin-editor-preview-label">预览</div>
            <div className="admin-editor-preview-body">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        )}
      </div>

      <div className="admin-editor-footer">
        <span>{stats.characters.toLocaleString('zh-CN')} / {maxLength.toLocaleString('zh-CN')} 字符</span>
        <span>{stats.lines} 行 · {stats.images} 张图片 · {stats.folds} 个折叠块</span>
        <span className="admin-editor-shortcut">Ctrl+B 粗体 · Ctrl+I 斜体 · Ctrl+K 链接</span>
      </div>
    </div>
  )
}

function getContentStats (content) {
  const lines = content ? content.split('\n').length : 0
  const images = (content.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length
  const folds = (content.match(/^>\s*\[!fold\]/gim) || []).length
  return { characters: content.length, lines, images, folds }
}
