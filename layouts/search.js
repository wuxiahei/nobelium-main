import { useEffect, useState } from 'react'
import BlogPost from '@/components/BlogPost'
import Container from '@/components/Container'
import Tags from '@/components/Tags'
import PropTypes from 'prop-types'
import { RotateCcw, Search, X } from 'lucide-react'

const SearchLayout = ({ tags, posts, currentTag }) => {
  const [searchValue, setSearchValue] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  let filteredBlogPosts = []
  if (posts) {
    filteredBlogPosts = posts.filter(post => {
      const tagContent = post.tags ? post.tags.join(' ') : ''
      const searchContent = `${post.title || ''} ${post.summary || ''} ${tagContent}`
      return searchContent.toLowerCase().includes(searchValue.toLowerCase())
    })
  }
  const visiblePosts = filteredBlogPosts.slice(0, visibleCount)
  const hasMore = visiblePosts.length < filteredBlogPosts.length

  useEffect(() => {
    setVisibleCount(20)
  }, [searchValue, currentTag])

  return (
    <Container>
      <div className="mb-5">
        <p className="ink-eyebrow">
          {currentTag ? `#${currentTag}` : '文章索引'}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[var(--ink-main)]">
          {currentTag ? `${currentTag} 下的文章` : '查找文章'}
        </h1>
      </div>
      <div className="relative">
        <input
          type="text"
          placeholder={
            currentTag ? `在 #${currentTag} 中搜索` : '搜索标题、摘要或标签'
          }
          value={searchValue}
          className="block w-full rounded-sm border border-[var(--ink-line)] bg-[var(--ink-surface)] px-4 py-3 pr-12 text-[var(--ink-main)] outline-none transition-colors placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-accent)] focus:ring-2 focus:ring-[var(--ink-accent-soft)]"
          onChange={e => setSearchValue(e.target.value)}
        />
        {searchValue
          ? (
          <button
            type="button"
            aria-label="Clear search"
            className="ai-icon-button ink-focus absolute right-2 top-1/2 -translate-y-1/2"
            title="清除搜索"
            onClick={() => setSearchValue('')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
            )
          : (
          <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
            )}
      </div>
      <Tags
        tags={tags}
        currentTag={currentTag}
      />
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        找到 {filteredBlogPosts.length} 篇
        {searchValue ? `，关键词“${searchValue}”` : ''}
        {currentTag ? `，标签 #${currentTag}` : ''}
        {hasMore ? `，当前显示 ${visiblePosts.length} 篇` : ''}
      </p>
      <div className="article-container mt-4">
        {!filteredBlogPosts.length && (
          <div className="border-y border-dashed border-[var(--ink-line)] bg-[var(--ink-surface)] p-8 text-[var(--ink-muted)]">
            <p>没有找到匹配的文章。</p>
            {searchValue && (
              <button
                type="button"
                className="ink-command mt-4"
                onClick={() => setSearchValue('')}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                重置搜索
              </button>
            )}
          </div>
        )}
        {visiblePosts.map(post => (
          <BlogPost key={post.id} post={post} />
        ))}
        {hasMore && (
          <button
            type="button"
            className="ink-command mx-auto mt-8 flex w-fit"
            onClick={() => setVisibleCount(current => current + 20)}
          >
            再显示 {Math.min(20, filteredBlogPosts.length - visiblePosts.length)} 篇
          </button>
        )}
      </div>
    </Container>
  )
}
SearchLayout.propTypes = {
  posts: PropTypes.array.isRequired,
  tags: PropTypes.object.isRequired,
  currentTag: PropTypes.string
}
export default SearchLayout
