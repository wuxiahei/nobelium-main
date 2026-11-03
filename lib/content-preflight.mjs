export const MAX_POST_CONTENT_LENGTH = 60000
export const MAX_POST_TITLE_LENGTH = 180
export const MAX_POST_SUMMARY_LENGTH = 300
export const MAX_POST_TAGS = 8
export const MAX_TAG_LENGTH = 40

const MANAGED_SLUG_PATTERN = /^[\p{L}\p{N}_-]+$/u
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g
const HTTP_LINK_PATTERN = /(?<!!)\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/gi

export function runContentPreflight (form, options = {}) {
  const value = form && typeof form === 'object' ? form : {}
  const posts = Array.isArray(options.posts) ? options.posts : []
  const currentNumber = Number(options.currentNumber)
  const mode = options.mode === 'draft' ? 'draft' : 'publish'
  const title = String(value.title || '').trim()
  const slug = String(value.slug || '').trim()
  const summary = String(value.summary || '').trim()
  const content = String(value.content || '')
  const tags = parseTags(value.tags)
  const issues = []

  addIssue(issues, 'title-empty', 'error', '请填写文章标题。', !title)
  addIssue(issues, 'title-long', 'error', `标题不能超过 ${MAX_POST_TITLE_LENGTH} 个字符。`, title.length > MAX_POST_TITLE_LENGTH)
  addIssue(issues, 'content-empty', mode === 'publish' ? 'error' : 'warning', mode === 'publish' ? '发布文章前需要填写正文。' : '草稿正文为空，仍可保存。', !content.trim())
  addIssue(issues, 'content-long', 'error', `正文不能超过 ${MAX_POST_CONTENT_LENGTH} 个字符。`, content.length > MAX_POST_CONTENT_LENGTH)
  addIssue(issues, 'summary-long', 'error', `摘要不能超过 ${MAX_POST_SUMMARY_LENGTH} 个字符。`, summary.length > MAX_POST_SUMMARY_LENGTH)
  addIssue(issues, 'tags-too-many', 'error', `最多使用 ${MAX_POST_TAGS} 个标签。`, tags.length > MAX_POST_TAGS)
  addIssue(issues, 'tag-long', 'error', `单个标签不能超过 ${MAX_TAG_LENGTH} 个字符。`, tags.some(tag => tag.length > MAX_TAG_LENGTH))

  if (slug && !MANAGED_SLUG_PATTERN.test(slug)) {
    addIssue(issues, 'slug-format', 'error', 'Slug 只能包含文字、数字、连字符和下划线，不能包含空格。', true)
  }

  if (slug) {
    const duplicate = posts.find(post => {
      if (Number(post?.githubIssueNumber) === currentNumber) return false
      return String(post?.slug || '').toLowerCase() === slug.toLowerCase()
    })
    addIssue(issues, 'slug-duplicate', 'error', `Slug “${slug}” 已被另一篇文章使用。`, Boolean(duplicate))
  }

  if (hasDuplicateTags(tags)) {
    addIssue(issues, 'tag-duplicate', 'warning', '存在重复标签，保存时会自动合并。', true)
  }

  let imageCount = 0
  let emptyAltCount = 0
  let insecureImageCount = 0
  for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    imageCount += 1
    const alt = String(match[1] || '').trim()
    const source = stripAngleBrackets(match[2])
    if (!alt) emptyAltCount += 1
    if (/^data:/i.test(source)) {
      addIssue(issues, 'image-data-url', 'error', '正文中仍有未上传的 data: 图片，请先上传到图片库。', true, '加入正文图片前请先上传图片。')
    } else if (/^(javascript|vbscript|file):/i.test(source)) {
      addIssue(issues, 'image-unsafe-url', 'error', '正文中包含不安全的图片地址。', true, '请移除该图片或改用 https 地址。')
    } else if (/^http:\/\//i.test(source)) {
      insecureImageCount += 1
    }
  }
  addIssue(issues, 'image-alt', 'warning', '有图片缺少 alt 描述，不利于无障碍阅读。', emptyAltCount > 0, `${emptyAltCount} 张图片需要补充说明。`)
  addIssue(issues, 'image-http', 'warning', '有图片使用 HTTP，建议改为 HTTPS。', insecureImageCount > 0, `${insecureImageCount} 张图片不是安全链接。`)

  let invalidLinkCount = 0
  for (const match of content.matchAll(HTTP_LINK_PATTERN)) {
    try {
      const url = new URL(match[1])
      if (!url.hostname) invalidLinkCount += 1
    } catch {
      invalidLinkCount += 1
    }
  }
  addIssue(issues, 'link-invalid', 'warning', '正文中有格式异常的外链。', invalidLinkCount > 0, `${invalidLinkCount} 个外链需要检查。`)

  if (imageCount > 20) {
    addIssue(issues, 'image-many', 'warning', '正文图片较多，可能影响移动端加载速度。', true, `当前共有 ${imageCount} 张图片。`)
  }

  return {
    issues,
    errors: issues.filter(issue => issue.level === 'error'),
    warnings: issues.filter(issue => issue.level === 'warning'),
    imageCount,
    tagCount: tags.length,
    ready: !issues.some(issue => issue.level === 'error')
  }
}

function addIssue (issues, code, level, message, condition, detail = '') {
  if (!condition) return
  issues.push({ code, level, message, detail })
}

function parseTags (value) {
  if (Array.isArray(value)) return value.map(tag => String(tag || '').trim()).filter(Boolean)
  return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean)
}

function hasDuplicateTags (tags) {
  const normalized = tags.map(tag => tag.toLocaleLowerCase())
  return new Set(normalized).size !== normalized.length
}

function stripAngleBrackets (value) {
  const source = String(value || '').trim()
  return source.startsWith('<') && source.endsWith('>') ? source.slice(1, -1).trim() : source
}
