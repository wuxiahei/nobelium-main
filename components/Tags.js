import Link from 'next/link'

const Tags = ({ tags, currentTag }) => {
  if (!tags) return null
  return (
    <div className="tag-container -mx-1">
      <ul className="flex max-w-full gap-2 overflow-x-auto px-1 py-4">
        {Object.keys(tags).map(key => {
          const selected = key === currentTag
          return (
            <li
              key={key}
              className={`whitespace-nowrap rounded-sm border text-sm font-medium transition-colors ${
                selected
                  ? 'border-[var(--ink-main)] bg-[var(--ink-main)] text-[var(--ink-paper)]'
                  : 'border-[var(--ink-line)] bg-[var(--ink-surface)] text-[var(--ink-muted)] hover:border-[var(--ink-accent)] hover:bg-[var(--ink-accent-soft)] hover:text-[var(--ink-main)]'
              }`}
            >
              <Link
                key={key}
                href={selected ? '/search' : `/tag/${encodeURIComponent(key)}`}
                className="block px-3 py-1.5 ink-focus"
              >
                {`${key} (${tags[key]})`}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default Tags
