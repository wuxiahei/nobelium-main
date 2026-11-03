import FormattedDate from '@/components/FormattedDate'
import { useConfig } from '@/lib/config'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

const BlogPost = ({ post }) => {
  const BLOG = useConfig()
  const summary = post.summary?.trim()
  const shouldShowSummary = isValidSummary(summary, post.title, post.slug)

  return (
    <Link
      href={`${BLOG.path}/${post.slug}`}
      className="post-index-row ink-focus"
      aria-label={`阅读《${post.title}》`}
    >
      <div className="post-index-date">
        <span>Published</span>
        <time><FormattedDate date={post.date} /></time>
      </div>

      <article className="post-index-entry">
        <h2>{post.title}</h2>
        {shouldShowSummary && <p className="post-index-summary">{summary}</p>}
        {post.tags && post.tags.length > 0 && (
          <div className="post-index-tags" aria-label="文章标签">
            {post.tags.slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </article>

      <span className="post-index-more" aria-hidden="true">
        <span>阅读札记</span>
        <ArrowUpRight className="h-4 w-4" />
      </span>
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