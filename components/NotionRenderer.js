import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { NotionRenderer as Renderer } from 'react-notion-x'
import { getTextContent } from 'notion-utils'
import { FONTS_SANS, FONTS_SERIF } from '@/consts'
import { useConfig } from '@/lib/config'
import Toggle from '@/components/notion-blocks/Toggle'
import LazyRender from '@/components/LazyRender'

const MermaidBlock = dynamic(() => {
  return import('@/components/notion-blocks/Mermaid').then(module => module.default)
}, {
  ssr: false,
  loading: () => <CodeLoading label="Rendering diagram..." />
})

const CodeBlock = dynamic(() => {
  return import('react-notion-x/third-party/code').then(module => module.Code)
}, {
  loading: () => <CodeLoading label="Loading code..." />
})

const CollectionBlock = dynamic(() => {
  return import('react-notion-x/third-party/collection').then(module => module.Collection)
}, {
  loading: () => <CodeLoading label="Loading collection..." />
})

const EquationBlock = dynamic(() => {
  return import('react-notion-x/third-party/equation').then(module => module.Equation)
}, {
  loading: () => <CodeLoading label="Loading equation..." />
})

const PdfBlock = dynamic(() => {
  return import('react-notion-x/third-party/pdf').then(module => module.Pdf)
}, {
  ssr: false,
  loading: () => <CodeLoading label="Loading PDF..." />
})

const prismLanguageCache = new Map()

const prismLanguageLoaders = {
  bash: () => import('prismjs/components/prism-bash'),
  shell: () => import('prismjs/components/prism-bash'),
  sh: () => import('prismjs/components/prism-bash'),
  css: () => import('prismjs/components/prism-css'),
  diff: () => import('prismjs/components/prism-diff'),
  docker: () => import('prismjs/components/prism-docker'),
  dockerfile: () => import('prismjs/components/prism-docker'),
  html: () => import('prismjs/components/prism-markup'),
  markup: () => import('prismjs/components/prism-markup'),
  javascript: () => import('prismjs/components/prism-javascript'),
  js: () => import('prismjs/components/prism-javascript'),
  json: () => import('prismjs/components/prism-json'),
  markdown: () => import('prismjs/components/prism-markdown'),
  md: () => import('prismjs/components/prism-markdown'),
  python: () => import('prismjs/components/prism-python'),
  py: () => import('prismjs/components/prism-python'),
  sql: () => import('prismjs/components/prism-sql'),
  typescript: async () => {
    await import('prismjs/components/prism-javascript')
    return import('prismjs/components/prism-typescript')
  },
  ts: async () => {
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
  },
  yaml: () => import('prismjs/components/prism-yaml'),
  yml: () => import('prismjs/components/prism-yaml')
}

function normalizeLanguage (language) {
  return (language || '').toLowerCase().trim().replace(/^language-/, '')
}

function loadPrismLanguage (language) {
  const normalized = normalizeLanguage(language)
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

function CodeLoading ({ label }) {
  return (
    <div className="my-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-zinc-950 dark:text-gray-400">
      {label}
    </div>
  )
}

function LazyBlock ({ children, label, minHeight = 160 }) {
  return (
    <LazyRender
      minHeight={minHeight}
      rootMargin="280px 0px"
      placeholder={<CodeLoading label={label} />}
    >
      {children}
    </LazyRender>
  )
}

function CodeSwitch (props) {
  const language = props.block?.properties?.language
    ? getTextContent(props.block.properties.language)
    : ''
  const normalizedLanguage = normalizeLanguage(language)
  const [ready, setReady] = useState(!prismLanguageLoaders[normalizedLanguage])

  useEffect(() => {
    let cancelled = false
    setReady(!prismLanguageLoaders[normalizedLanguage])

    loadPrismLanguage(normalizedLanguage)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [normalizedLanguage])

  if (normalizedLanguage === 'mermaid') {
    return <MermaidBlock {...props} />
  }

  if (!ready) {
    return <CodeLoading label={`Loading ${language || 'code'}...`} />
  }

  return <CodeBlock {...props} />
}

// Lazy-load some heavy components & override the renderers of some block types
const components = {
  /* Lazy-load */

  // Code block
  Code: CodeSwitch,
  // Database block
  Collection: props => (
    <LazyBlock label="Loading collection..." minHeight={220}>
      <CollectionBlock {...props} />
    </LazyBlock>
  ),
  // Equation block & inline variant
  Equation: props => (
    <LazyBlock label="Loading equation..." minHeight={96}>
      <EquationBlock {...props} />
    </LazyBlock>
  ),
  // PDF (Embed block)
  Pdf: props => (
    <LazyBlock label="Loading PDF..." minHeight={240}>
      <PdfBlock {...props} />
    </LazyBlock>
  ),
  // Tweet block
  Tweet: dynamic(() => {
    return import('react-tweet-embed').then(module => {
      const { default: TweetEmbed } = module
      return function Tweet ({ id }) {
        return (
          <LazyBlock label="Loading tweet..." minHeight={220}>
            <TweetEmbed tweetId={id} options={{ theme: 'dark' }} />
          </LazyBlock>
        )
      }
    })
  }),

  /* Overrides */

  toggle_nobelium: ({ block, children }) => (
    <Toggle block={block}>{children}</Toggle>
  )
}

const mapPageUrl = id => `https://www.notion.so/${id.replace(/-/g, '')}`

/**
 * Notion page renderer
 *
 * A wrapper of react-notion-x/NotionRenderer with predefined `components` and `mapPageUrl`
 *
 * @param props - Anything that react-notion-x/NotionRenderer supports
 */
export default function NotionRenderer (props) {
  const config = useConfig()

  const font = {
    'sans-serif': FONTS_SANS,
    'serif': FONTS_SERIF
  }[config.font]

  // Mark block types to be custom rendered by appending a suffix
  if (props.recordMap) {
    for (const { value: block } of Object.values(props.recordMap.block)) {
      switch (block?.type) {
        case 'toggle':
          block.type += '_nobelium'
          break
      }
    }
  }

  return (
    <>
      <style jsx global>
        {`
        .notion {
          --notion-font: ${font};
        }
        `}
      </style>
      <Renderer
        components={components}
        mapPageUrl={mapPageUrl}
        {...props}
      />
    </>
  )
}
