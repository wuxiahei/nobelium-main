export const MANAGED_IMAGE_PREFIX = 'nobelium/images/'

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g

export function normalizeManagedPathname (value) {
  const source = String(value || '').trim()
  if (!source) return ''

  let pathname = source
  if (/^https?:\/\//i.test(source) || source.startsWith('/')) {
    try {
      const url = source.startsWith('/') ? new URL(source, 'https://blob.local') : new URL(source)
      pathname = url.pathname
    } catch {
      return ''
    }
  }

  pathname = pathname.split('?')[0].split('#')[0].replace(/^\/+/, '')
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return ''
  }

  if (!pathname.startsWith(MANAGED_IMAGE_PREFIX)) return ''
  if (pathname.includes('\\') || pathname.includes('\0')) return ''
  if (pathname.split('/').some(segment => segment === '..' || segment === '.')) return ''
  return pathname
}

export function isManagedImageSource (value) {
  return Boolean(normalizeManagedPathname(value))
}

export function extractMarkdownImageSources (content) {
  const sources = []
  for (const match of String(content || '').matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const source = stripAngleBrackets(match[2])
    if (source) sources.push(source)
  }
  return sources
}

export function extractManagedImagePathnames (content) {
  return [...new Set(
    extractMarkdownImageSources(content)
      .map(normalizeManagedPathname)
      .filter(Boolean)
  )]
}

export function countImageReferences (contents, pathname) {
  const normalized = normalizeManagedPathname(pathname)
  if (!normalized) return 0
  return contents.reduce((count, content) => {
    return count + (extractManagedImagePathnames(content).includes(normalized) ? 1 : 0)
  }, 0)
}

function stripAngleBrackets (value) {
  const source = String(value || '').trim()
  return source.startsWith('<') && source.endsWith('>') ? source.slice(1, -1).trim() : source
}
