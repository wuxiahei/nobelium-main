import PropTypes from 'prop-types'
import { getPageTableOfContents } from 'notion-utils'
import cn from 'classnames'
import { useEffect, useMemo, useState } from 'react'

export default function TableOfContents ({ blockMap, className, style }) {
  const collectionId = Object.keys(blockMap.collection)[0]
  const collectionPage = collectionId ? Object.values(blockMap.block).find(block => block.value.parent_id === collectionId) : null
  const page = collectionPage ? collectionPage.value : null
  const nodes = useMemo(() => page ? getPageTableOfContents(page, blockMap) : [], [page, blockMap])
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (!nodes.length) return

    const headings = nodes
      .map(node => document.querySelector(`.notion-block-${node.id.replaceAll('-', '')}`))
      .filter(Boolean)

    if (!headings.length) return

    const observer = new window.IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]) {
          const className = typeof visible[0].target.className === 'string'
            ? visible[0].target.className
            : ''
          const id = className.match(/notion-block-([a-f0-9]+)/)?.[1]
          setActiveId(id)
        }
      },
      {
        rootMargin: '-84px 0px -65% 0px',
        threshold: [0, 1]
      }
    )

    headings.forEach(heading => observer.observe(heading))

    return () => {
      headings.forEach(heading => observer.unobserve(heading))
    }
  }, [nodes])

  if (!nodes.length) return null

  /**
   * @param {string} id - The ID of target heading block (could be in UUID format)
   */
  function scrollTo (id) {
    id = id.replaceAll('-', '')
    const target = document.querySelector(`.notion-block-${id}`)
    if (!target) return
    // `65` is the height of expanded nav
    // TODO: Remove the magic number
    const top = document.documentElement.scrollTop + target.getBoundingClientRect().top - 65
    document.documentElement.scrollTo({
      top,
      behavior: 'smooth'
    })
  }

  return (
    <aside
      className={cn(className, 'ml-8 border-l border-[var(--ink-line)] pl-4 text-sm text-[var(--ink-muted)]')}
      style={style}
    >
      {nodes.map(node => (
        <div key={node.id}>
          <button
            type="button"
            data-target-id={node.id}
            className={cn(
              'block max-w-[220px] cursor-pointer break-words py-1.5 text-left leading-5 transition-colors hover:text-[var(--ink-main)] ink-focus',
              activeId === node.id.replaceAll('-', '')
                ? 'font-semibold text-[var(--ink-accent)]'
                : 'text-[var(--ink-muted)]'
            )}
            style={{ paddingLeft: (node.indentLevel * 24) + 'px' }}
            onClick={() => scrollTo(node.id)}
          >
            {node.text}
          </button>
        </div>
      ))}
    </aside>
  )
}

TableOfContents.propTypes = {
  blockMap: PropTypes.object.isRequired
}
