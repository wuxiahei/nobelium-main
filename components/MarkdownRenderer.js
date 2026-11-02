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
  table ({ children, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    )
  },
  img ({ alt = '', ...props }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} loading="lazy" decoding="async" {...props} />
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