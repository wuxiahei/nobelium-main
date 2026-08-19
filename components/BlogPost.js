import FormattedDate from '@/components/FormattedDate'
import { useConfig } from '@/lib/config'
import Link from 'next/link'

const BlogPost = ({ post }) => {
  const BLOG = useConfig()
  const summary = post.summary?.trim()
  const shouldShowSummary = isValidSummary(summary, post.title, post.slug)

  return (
    <Link
      href={`${BLOG.path}/${post.slug}`}
      className="group -mx-3 block border-b border-[var(--ink-line)] px-3 py-6 transition-colors hover:bg-[var(--ink-surface)] ink-focus md:py-7"
    >
      <article key={post.id} className="transition duration-200 md:grid md:grid-cols-[148px_minmax(0,1fr)] md:gap-8">
        <div className="mb-3 text-[0.78rem] uppercase tracking-normal text-[var(--ink-muted)] md:mb-0 md:pt-1">
          <time className="block">
            <FormattedDate date={post.date} />
          </time>
        </div>
        <div>
          <header>
            <h2 className="text-xl font-semibold leading-snug tracking-normal text-[var(--ink-main)] transition-colors group-hover:text-[var(--ink-accent)] md:text-[1.45rem]">
              {post.title}
            </h2>
          </header>
          {shouldShowSummary && (
            <p className="mt-3 max-w-2xl line-clamp-2 leading-8 text-[var(--ink-muted)]">
              {summary}
            </p>
          )}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="rounded-sm bg-transparent px-2.5 py-1 text-xs font-medium uppercase tracking-normal text-[var(--ink-muted)] ring-1 ring-[var(--ink-line)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Link>
  )
}

export default BlogPost

function isValidSummary (summary, title, slug) {
  if (!summary) return false

  const normalizedSummary = summary.toLowerCase().trim()
  const normalizedTitle = title?.toLowerCase().trim()
  const normalizedSlug = slug?.toLowerCase().trim()

  if (normalizedSummary === normalizedTitle || normalizedSummary === normalizedSlug) {
    return false
  }

  const words = normalizedSummary.split(/\s+/).filter(Boolean)
  if (words.length <= 1 && normalizedSummary.length <= 18) {
    return false
  }

  return /[\s,.，。;；:：!?！？]/.test(summary) || normalizedSummary.length >= 24
}
