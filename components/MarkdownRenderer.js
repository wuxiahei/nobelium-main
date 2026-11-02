import { Children } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

const components = {
  a ({ href, children, ...props }) {
    const external = /^https?:\/\//i.test(href || '')
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer noopener' : undefined}
        {...props}
      >
        {children}
      </a>
    )
  },
  blockquote ({ children, ...props }) {
    const items = Children.toArray(children).filter(node => typeof node !== 'string' || node.trim())
    const firstText = extractText(items[0]).trim()
    const foldMatch = firstText.match(/^\[!fold\]\s*(.*)$/i)

    if (foldMatch) {
      const title = foldMatch[1].trim() || '点击展开'
      const body = items.slice(1)
      return (
        <details className="markdown-fold">
          <summary>{title}</summary>
          <div className="markdown-fold-body">
            {body.length ? body : <p>折叠内容</p>}
          </div>
        </details>
      )
    }

    return <blockquote {...props}>{children}</blockquote>
  },
  table ({ children, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    )
  },
  img ({ alt = '', title = '', src = '', ...props }) {
    const image = parseImageMeta(title)
    const width = image.width ? { width: image.width + '%' } : undefined
    return (
      <span className={'markdown-image markdown-image-' + (image.managed ? image.position : 'default')} style={width} role="figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} title={image.managed ? undefined : title} loading="lazy" decoding="async" {...props} />
        {image.managed && alt ? <span className="markdown-image-caption">{alt}</span> : null}
      </span>
    )
  }
}

export default function MarkdownRenderer ({ content }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}

function extractText (node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && node.props) return extractText(node.props.children)
  return ''
}

function parseImageMeta (title) {
  const match = String(title || '').trim().toLowerCase().match(/^(left|right|center|full)(?:\s+(\d{1,3})%)?$/)
  if (!match) return { managed: false, position: 'center', width: null }
  const parsedWidth = Number(match[2])
  return {
    managed: true,
    position: match[1],
    width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? Math.min(parsedWidth, 100) : null
  }
}
