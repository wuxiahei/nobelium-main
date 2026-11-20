import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import BlogPost from '@/components/BlogPost'
import Container from '@/components/Container'
import Tags from '@/components/Tags'
import PropTypes from 'prop-types'
import { RotateCcw, Search, X } from 'lucide-react'
import { filterAndScorePosts } from '@/lib/search-index.mjs'
import { useConfig } from '@/lib/config'
import { getPostSortLabel } from '@/lib/post-order.mjs'

const RECENT_SEARCHES_KEY = 'nobelium:recent-searches'

const SearchLayout = ({ tags, posts, currentTag }) => {
  const router = useRouter()
  const { sortBy } = useConfig()
  const inputRef = useRef(null)
  const lastUrlQueryRef = useRef(null)
  const [searchValue, setSearchValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const [recentSearches, setRecentSearches] = useState([])
  const [recentSearchesReady, setRecentSearchesReady] = useState(false)
  const urlQuery = getSingleQuery(router.query.q)
  const normalizedQuery = debouncedQuery.trim()
  const results = useMemo(
    () => filterAndScorePosts(posts || [], normalizedQuery),
    [posts, normalizedQuery]
  )
  const visibleResults = results.slice(0, visibleCount)
  const hasMore = visibleResults.length < results.length

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
      if (Array.isArray(stored)) {
        setRecentSearches(stored.filter(item => typeof item === 'string').slice(0, 5))
      }
    } catch {
      setRecentSearches([])
    }
    setRecentSearchesReady(true)
  }, [])

  useEffect(() => {
    if (!recentSearchesReady) return
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches))
    } catch {
      // Search still works when storage is unavailable or full.
    }
  }, [recentSearches, recentSearchesReady])

  useEffect(() => {
    if (!router.isReady || lastUrlQueryRef.current === urlQuery) return
    lastUrlQueryRef.current = urlQuery
    setSearchValue(urlQuery)
    setDebouncedQuery(urlQuery)
  }, [router.isReady, urlQuery])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextQuery = searchValue.trim()
      setDebouncedQuery(nextQuery)
      if (!router.isReady || nextQuery === urlQuery) return

      lastUrlQueryRef.current = nextQuery
      const nextRouteQuery = { ...router.query }
      if (nextQuery) nextRouteQuery.q = nextQuery
      else delete nextRouteQuery.q
      router.replace(
        { pathname: router.pathname, query: nextRouteQuery },
        undefined,
        { shallow: true, scroll: false }
      )
    }, 180)

    return () => window.clearTimeout(timeout)
  }, [searchValue, router, urlQuery])

  useEffect(() => {
    setVisibleCount(20)
  }, [normalizedQuery, currentTag])

  useEffect(() => {
    const handleShortcut = event => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      inputRef.current?.focus()
    }

    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  function rememberSearch (value) {
    const term = value.trim()
    if (!term) return
    setRecentSearches(previous => [
      term,
      ...previous.filter(item => item.toLowerCase() !== term.toLowerCase())
    ].slice(0, 5))
  }

  function useRecentSearch (term) {
    setSearchValue(term)
    inputRef.current?.focus()
  }

  function clearSearch () {
    setSearchValue('')
    inputRef.current?.focus()
  }

  return (
    <Container layout="search" title={currentTag ? `#${currentTag} · 文章索引` : '文章索引'} description="按标题、正文、摘要和标签搜索全部文章">
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
              ref={inputRef}
              type="search"
              aria-label="搜索文章"
              aria-keyshortcuts="/"
              placeholder={currentTag ? `在 #${currentTag} 中搜索标题或正文` : '搜索标题、正文、摘要或标签'}
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              onBlur={() => rememberSearch(searchValue)}
              onKeyDown={event => {
                if (event.key === 'Enter') rememberSearch(searchValue)
              }}
            />
            {searchValue
              ? (
                <button type="button" aria-label="清除搜索" title="清除搜索" onClick={clearSearch}>
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
                )
              : <kbd className="search-shortcut" aria-hidden="true">/</kbd>}
          </label>

          {recentSearches.length > 0 && !searchValue && (
            <div className="search-recents" aria-label="最近搜索">
              <span>最近搜索</span>
              <div>
                {recentSearches.map(term => (
                  <button key={term} type="button" onClick={() => useRecentSearch(term)}>
                    {term}
                  </button>
                ))}
                <button
                  type="button"
                  className="search-recents-clear"
                  onClick={() => setRecentSearches([])}
                >
                  清空
                </button>
              </div>
            </div>
          )}

          <Tags tags={tags} currentTag={currentTag} />

          <div className="search-results-summary" role="status">
            <span>共 {results.length} 篇</span>
            <span>{normalizedQuery ? '按相关度排序' : getPostSortLabel(sortBy)}</span>
            {normalizedQuery && <span>关键词「{normalizedQuery}」</span>}
            {currentTag && <span>标签 #{currentTag}</span>}
            {hasMore && <span>当前显示 {visibleResults.length} 篇</span>}
          </div>
        </div>

        <div className="article-container search-results">
          {!results.length && (
            <div className="search-empty">
              <p className="search-kicker">No entries found</p>
              <h2>没有找到匹配的文章</h2>
              <p>换一个关键词，或回到全部文章索引继续浏览。</p>
              {searchValue && (
                <button type="button" className="ink-command mt-4" onClick={clearSearch}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  重置搜索
                </button>
              )}
            </div>
          )}

          {visibleResults.map(result => (
            <BlogPost
              key={result.post.id}
              post={result.post}
              query={normalizedQuery}
              snippet={result.snippet}
            />
          ))}

          {hasMore && (
            <button
              type="button"
              className="ink-command search-more"
              onClick={() => setVisibleCount(current => current + 20)}
            >
              再显示 {Math.min(20, results.length - visibleResults.length)} 篇
            </button>
          )}
        </div>
      </section>
    </Container>
  )
}

function getSingleQuery (value) {
  return typeof value === 'string' ? value : ''
}

function isTypingTarget (target) {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

SearchLayout.propTypes = {
  posts: PropTypes.array.isRequired,
  tags: PropTypes.object.isRequired,
  currentTag: PropTypes.string
}

export default SearchLayout