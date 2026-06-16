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
      className="group block border-b border-stone-200 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-500 dark:border-stone-800 md:py-7"
    >
      <article key={post.id} className="transition duration-200 md:grid md:grid-cols-[148px_minmax(0,1fr)] md:gap-8">
        <div className="mb-3 text-[0.78rem] uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 md:mb-0 md:pt-1">
          <time className="block">
            <FormattedDate date={post.date} />
          </time>
        </div>
        <div>
          <header>
            <h2 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-gray-950 transition-colors group-hover:text-teal-800 dark:text-gray-50 dark:group-hover:text-teal-200 md:text-[1.45rem]">
              {post.title}
            </h2>
          </header>
          {shouldShowSummary && (
            <p className="mt-3 max-w-2xl line-clamp-2 leading-8 text-stone-600 dark:text-stone-300">
              {summary}
            </p>
          )}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-transparent px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 ring-1 ring-stone-200 dark:text-stone-300 dark:ring-stone-700/80"
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
