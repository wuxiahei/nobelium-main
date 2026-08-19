import Link from 'next/link'

const TagItem = ({ tag }) => (
  <Link
    href={`/tag/${encodeURIComponent(tag)}`}
    className="mr-1 inline-flex rounded-sm border border-[var(--ink-line)] px-2 py-1 text-sm leading-none text-[var(--ink-muted)] transition-colors hover:border-[var(--ink-accent)] hover:bg-[var(--ink-accent-soft)] hover:text-[var(--ink-main)] ink-focus"
  >
    {tag}
  </Link>
)

export default TagItem
