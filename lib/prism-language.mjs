import Prism from 'prismjs'

const prismLanguageCache = new Map()

const languageAliases = {
  sh: 'bash',
  shell: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  yml: 'yaml',
  dockerfile: 'docker',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp'
}

const prismLanguageLoaders = {
  bash: () => import('prismjs/components/prism-bash'),
  css: () => import('prismjs/components/prism-css'),
  diff: () => import('prismjs/components/prism-diff'),
  docker: () => import('prismjs/components/prism-docker'),
  go: () => import('prismjs/components/prism-go'),
  java: () => import('prismjs/components/prism-java'),
  javascript: () => import('prismjs/components/prism-javascript'),
  json: () => import('prismjs/components/prism-json'),
  markdown: () => import('prismjs/components/prism-markdown'),
  markup: () => import('prismjs/components/prism-markup'),
  python: () => import('prismjs/components/prism-python'),
  rust: () => import('prismjs/components/prism-rust'),
  sql: () => import('prismjs/components/prism-sql'),
  yaml: () => import('prismjs/components/prism-yaml'),
  c: () => import('prismjs/components/prism-c'),
  cpp: async () => {
    await import('prismjs/components/prism-c')
    return import('prismjs/components/prism-cpp')
  },
  csharp: () => import('prismjs/components/prism-csharp'),
  kotlin: () => import('prismjs/components/prism-kotlin'),
  ruby: () => import('prismjs/components/prism-ruby'),
  swift: () => import('prismjs/components/prism-swift'),
  typescript: async () => {
    await import('prismjs/components/prism-javascript')
    return import('prismjs/components/prism-typescript')
  },
  jsx: async () => {
    await import('prismjs/components/prism-markup')
    await import('prismjs/components/prism-javascript')
    return import('prismjs/components/prism-jsx')
  },
  tsx: async () => {
    await import('prismjs/components/prism-markup')
    await import('prismjs/components/prism-javascript')
    await import('prismjs/components/prism-typescript')
    await import('prismjs/components/prism-jsx')
    return import('prismjs/components/prism-tsx')
  }
}

export function normalizePrismLanguage (language) {
  const normalized = String(language || '')
    .toLowerCase()
    .trim()
    .replace(/^language-/, '')
  return languageAliases[normalized] || normalized
}

export function hasPrismLanguage (language) {
  return Boolean(prismLanguageLoaders[normalizePrismLanguage(language)])
}

export function loadPrismLanguage (language) {
  const normalized = normalizePrismLanguage(language)
  const loader = prismLanguageLoaders[normalized]

  if (!loader) return Promise.resolve()
  if (!prismLanguageCache.has(normalized)) {
    prismLanguageCache.set(normalized, loader().catch(error => {
      prismLanguageCache.delete(normalized)
      throw error
    }))
  }

  return prismLanguageCache.get(normalized)
}

export function highlightPrismCode (code, language) {
  const normalized = normalizePrismLanguage(language)
  const grammar = Prism.languages[normalized]
  if (!grammar) return ''

  try {
    return Prism.highlight(String(code || ''), grammar, normalized)
  } catch {
    return ''
  }
}

export function getPrismLanguageLabel (language) {
  const normalized = String(language || '').trim()
  return normalized || 'text'
}