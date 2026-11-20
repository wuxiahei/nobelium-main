import PropTypes from 'prop-types'
import { getPageTableOfContents } from 'notion-utils'
import cn from 'classnames'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function TableOfContents ({ blockMap, items, className, style, mobile = false }) {
  const nodes = useMemo(() => getTocNodes(blockMap, items), [blockMap, items])
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (!nodes.length) return

    const headings = nodes
      .map(node => [node, resolveHeading(node)])
      .filter(([, element]) => element)

    if (!headings.length) return

    if (typeof window.IntersectionObserver !== 'function') return undefined

    const offset = getArticleScrollOffset()
    const observer = new window.IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (!visible[0]) return
        const match = headings.find(([, element]) => element === visible[0].target)
        if (match) setActiveId(match[0].key)
      },
      {
        rootMargin: `-${offset}px 0px -62% 0px`,
        threshold: [0, 1]
      }
    )

    headings.forEach(([, heading]) => observer.observe(heading))

    return () => {
      headings.forEach(([, heading]) => observer.unobserve(heading))
    }
  }, [nodes])

  if (!nodes.length) return null

  function scrollTo (node) {
    const target = resolveHeading(node)
    if (!target) return

    const top = window.scrollY + target.getBoundingClientRect().top - getArticleScrollOffset()
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth'
    })
    setActiveId(node.key)

    if (node.kind === 'markdown' && window.history?.replaceState) {
      window.history.replaceState(
        window.history.state,
        '',
        '#' + encodeURIComponent(node.documentId)
      )
    }
  }

  const entries = nodes.map(node => (
    <button
      key={node.key}
      type="button"
      data-target-id={node.documentId}
      className={cn(
        'block max-w-[220px] cursor-pointer break-words py-1.5 text-left leading-5 transition-colors hover:text-[var(--ink-main)] ink-focus',
        activeId === node.key
          ? 'font-semibold text-[var(--ink-accent)]'
          : 'text-[var(--ink-muted)]'
      )}
      style={{ paddingLeft: (node.indentLevel * 18) + 'px' }}
      onClick={() => scrollTo(node)}
    >
      {node.text}
    </button>
  ))

  if (mobile) {
    return (
      <details className="article-toc-mobile lg:hidden">
        <summary>
          <span>本文目录</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </summary>
        <nav aria-label="本文目录">
          {entries}
        </nav>
      </details>
    )
  }

  return (
    <aside
      className={cn(className, 'ml-8 max-h-[calc(100vh-var(--article-scroll-offset)-2rem)] overflow-y-auto border-l border-[var(--ink-line)] pl-4 text-sm text-[var(--ink-muted)]')}
      style={style}
    >
      <p className="mb-2 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-[var(--ink-seal)]">
        本文目录
      </p>
      <nav aria-label="本文目录">
        {entries}
      </nav>
    </aside>
  )
}

function getTocNodes (blockMap, items) {
  if (Array.isArray(items) && items.length) {
    const topLevel = Math.min(...items.map(item => item.level || 1))
    return items.map(item => ({
      key: item.id,
      documentId: item.id,
      kind: 'markdown',
      text: item.text,
      indentLevel: Math.max(0, (item.level || topLevel) - topLevel)
    }))
  }

  if (!blockMap?.block) return []
  const collectionId = Object.keys(blockMap.collection || {})[0]
  const collectionPage = collectionId
    ? Object.values(blockMap.block).find(block => block.value?.parent_id === collectionId)
    : null
  const page = collectionPage?.value || Object.values(blockMap.block).find(block => block.value?.type === 'page')?.value
  if (!page) return []

  return getPageTableOfContents(page, blockMap).map(node => {
    const documentId = node.id.replaceAll('-', '')
    return {
      key: documentId,
      documentId,
      kind: 'notion',
      text: node.text,
      indentLevel: Math.max(0, node.indentLevel || 0)
    }
  })
}

function resolveHeading (node) {
  if (typeof document === 'undefined') return null
  return node.kind === 'markdown'
    ? document.getElementById(node.documentId)
    : document.querySelector(`.notion-block-${node.documentId}`)
}

function getArticleScrollOffset () {
  if (typeof window === 'undefined') return 96
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--article-scroll-offset')
  const offset = Number.parseFloat(raw)
  return Number.isFinite(offset) ? offset : 96
}

TableOfContents.propTypes = {
  blockMap: PropTypes.object,
  items: PropTypes.array,
  className: PropTypes.string,
  style: PropTypes.object,
  mobile: PropTypes.bool
}