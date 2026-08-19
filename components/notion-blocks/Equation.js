import { useState } from 'react'
import katex from 'katex'
import { Check, Copy } from 'lucide-react'
import { getTextContent } from 'notion-utils'

export default function Equation ({ block, math, inline = false, className = '' }) {
  const [copied, setCopied] = useState(false)
  const source = getEquationSource(block, math)

  if (!source) {
    return inline
      ? <span className={`equation-fallback equation-fallback-inline ${className}`}>[公式内容不可用]</span>
      : <div className={`equation-fallback ${className}`}>公式内容不可用：Notion 未返回表达式源文本。</div>
  }

  let html = ''
  let renderError = false
  try {
    html = katex.renderToString(source, {
      displayMode: !inline,
      output: 'htmlAndMathml',
      strict: false,
      throwOnError: true,
      trust: false
    })
  } catch {
    renderError = true
  }

  if (inline) {
    if (renderError) {
      return <code className={`equation-fallback equation-fallback-inline ${className}`} title="公式无法渲染，已显示源文本">{source}</code>
    }

    return <span className={`notion-equation notion-equation-inline ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  }

  async function copySource () {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure className={`equation-shell ${renderError ? 'equation-shell-error' : ''} ${className}`}>
      {renderError
        ? <code className="equation-source-fallback">{source}</code>
        : <div className="equation-rendered" dangerouslySetInnerHTML={{ __html: html }} />}
      <figcaption>
        <code title={source}>{source}</code>
        <button type="button" className="ai-icon-button ink-focus" onClick={copySource} aria-label="复制公式源文本" title="复制公式源文本">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      </figcaption>
      {renderError && <p>公式无法渲染，已保留源文本。</p>}
    </figure>
  )
}

function getEquationSource (block, math) {
  if (typeof math === 'string' && math.trim()) return math.trim()
  const title = block?.properties?.title
  if (!title) return ''
  return getTextContent(title).trim()
}
