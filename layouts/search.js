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
    <Container title={currentTag ? `#${currentTag} · 文章索引` : '文章索引'} description="按标题、摘要和标签浏览全部文章">
      <section className="search-stage">
        <header className="search-header">
          <div>
            <p className="search-kicker">{currentTag ? 'Archive / Tag' : 'Archive / Index'}</p>
            <h1>{currentTag ? `${currentTag} 下的文章` : '文章索引'}</h1>
            <p className="search-intro">
              {currentTag
                ? `从全部札记中整理出与「${currentTag}」有关的篇目。`
                : '按时间、主题与关键词翻阅这座持续生长的工作室。'}
            </p>
          </div>
          <div className="search-stamp" aria-hidden="true">
            <span>{currentTag ? 'TAG' : 'IDX'}</span>
            <strong>{String(posts?.length || 0).padStart(2, '0')}</strong>
          </div>
        </header>

        <div className="search-panel">
          <label className="search-field">
            <Search className="h-5 w-5" aria-hidden="true" />
            <input
              type="text"
              aria-label="搜索文章"
              placeholder={currentTag ? `在 #${currentTag} 中搜索` : '搜索标题、摘要或标签'}
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
            />
            {searchValue && (
              <button type="button" aria-label="清除搜索" title="清除搜索" onClick={() => setSearchValue('')}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </label>

          <Tags tags={tags} currentTag={currentTag} />

          <div className="search-results-summary" role="status">
            <span>共 {filteredBlogPosts.length} 篇</span>
            {searchValue && <span>关键词「{searchValue}」</span>}
            {currentTag && <span>标签 #{currentTag}</span>}
            {hasMore && <span>当前显示 {visiblePosts.length} 篇</span>}
          </div>
        </div>

        <div className="article-container search-results">
          {!filteredBlogPosts.length && (
            <div className="search-empty">
              <p className="search-kicker">No entries found</p>
              <h2>没有找到匹配的文章</h2>
              <p>换一个关键词，或回到全部文章索引继续浏览。</p>
              {searchValue && (
                <button type="button" className="ink-command mt-4" onClick={() => setSearchValue('')}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  重置搜索
                </button>
              )}
            </div>
          )}

          {visiblePosts.map(post => <BlogPost key={post.id} post={post} />)}

          {hasMore && (
            <button
              type="button"
              className="ink-command search-more"
              onClick={() => setVisibleCount(current => current + 20)}
            >
              再显示 {Math.min(20, filteredBlogPosts.length - visiblePosts.length)} 篇
            </button>
          )}
        </div>
      </section>
    </Container>
  )
}

SearchLayout.propTypes = {
  posts: PropTypes.array.isRequired,
  tags: PropTypes.object.isRequired,
  currentTag: PropTypes.string
}

export default SearchLayout