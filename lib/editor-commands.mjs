export const EDITOR_COMMANDS = [
  { value: 'h2', label: '二级标题', keywords: 'heading h2 标题', block: '## 标题文字', marker: '标题文字' },
  { value: 'h1', label: '一级标题', keywords: 'heading h1 标题', block: '# 标题文字', marker: '标题文字' },
  { value: 'h3', label: '三级标题', keywords: 'heading h3 标题', block: '### 标题文字', marker: '标题文字' },
  { value: 'image', label: '插入图片', keywords: 'image img 图片' },
  { value: 'quote', label: '引用', keywords: 'quote 引用', block: '> 引用内容', marker: '引用内容' },
  { value: 'code', label: '代码块', keywords: 'code 代码', block: '```js\n在这里写代码\n```', marker: '在这里写代码' },
  { value: 'fold', label: '折叠块', keywords: 'fold toggle 折叠', block: '> [!fold] 折叠标题\n>\n> 这里写折叠内容。', marker: '折叠标题' },
  { value: 'bullet', label: '无序列表', keywords: 'list bullet 列表', block: '- 列表项', marker: '列表项' },
  { value: 'ordered', label: '有序列表', keywords: 'list ordered 列表', block: '1. 列表项', marker: '列表项' },
  { value: 'task', label: '任务清单', keywords: 'todo task 待办', block: '- [ ] 待办事项', marker: '待办事项' },
  { value: 'table', label: '表格', keywords: 'table 表格', block: '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |', marker: '内容' },
  { value: 'formula', label: '数学公式', keywords: 'math formula 公式', block: '$$\nE = mc^2\n$$', marker: 'E = mc^2' },
  { value: 'divider', label: '分隔线', keywords: 'divider 分隔线', block: '---' }
]

export function getSlashCommand (content, start, end = start) {
  if (start !== end) return null
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const match = content.slice(lineStart, start).match(/^([ \t]*)\/([^\s/]*)$/)
  if (!match) return null
  // A slash inside a fenced code block is code, not an editor command.
  let fence = null
  for (const line of content.slice(0, lineStart).split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (!marker) continue
    if (!fence) fence = marker[1]
    else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^\s*(`+|~+)\s*$/.test(line)) fence = null
  }
  if (fence) return null
  return { start: lineStart + match[1].length, end: start, query: match[2].toLowerCase() }
}

export function filterEditorCommands (query) {
  return EDITOR_COMMANDS.filter(command => (command.label + ' ' + command.keywords).toLowerCase().includes(query.toLowerCase()))
}
