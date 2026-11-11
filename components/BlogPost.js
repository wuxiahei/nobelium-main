import FormattedDate from '@/components/FormattedDate'
import { useConfig } from '@/lib/config'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { splitSearchHighlight } from '@/lib/search-index.mjs'
import { getPostListDate } from '@/lib/post-order.mjs'

const BlogPost = ({ post, query = '', snippet = '' }) => {
  const BLOG = useConfig()
  const listDate = getPostListDate(post, BLOG.sortBy)
  const summary = post.summary?.trim()
  const showSearchSnippet = Boolean(query && snippet)
  const shouldShowSummary = !showSearchSnippet && isValidSummary(summary, post.title, post.slug)

  return (
    <Link
      href={`${BLOG.path}/${post.slug}`}
      className="post-index-row ink-focus"
      aria-label={`阅读《${post.title}》`}
    >
      <div className="post-index-date">
        <span>{listDate.updated ? 'Updated' : 'Published'}</span>
        {listDate.timestamp !== null
          ? (
            <time dateTime={new Date(listDate.timestamp).toISOString()} title={listDate.updated ? '最后更新时间' : '发布时间'}>
              <FormattedDate date={listDate.timestamp} />
            </time>
            )
          : <span>日期待补充</span>}
      </div>

      <article className="post-index-entry">
        <h2><HighlightText text={post.title} query={query} /></h2>
        {showSearchSnippet && (
          <p className="post-index-summary post-index-snippet">
            <span className="post-index-hit-label">正文命中</span>
            <HighlightText text={snippet} query={query} />
          </p>
        )}
        {shouldShowSummary && (
          <p className="post-index-summary">
            <HighlightText text={summary} query={query} />
          </p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="post-index-tags" aria-label="文章标签">
            {post.tags.slice(0, 4).map(tag => (
              <span key={tag}><HighlightText text={tag} query={query} /></span>
            ))}
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

function HighlightText ({ text, query }) {
  return splitSearchHighlight(text, query).map((part, index) => (
    part.match
      ? <mark key={index}>{part.text}</mark>
      : <span key={index}>{part.text}</span>
  ))
}

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