import { useState } from 'react'
import BlogPost from '@/components/BlogPost'
import Container from '@/components/Container'
import Tags from '@/components/Tags'
import PropTypes from 'prop-types'

const SearchLayout = ({ tags, posts, currentTag }) => {
  const [searchValue, setSearchValue] = useState('')
  let filteredBlogPosts = []
  if (posts) {
    filteredBlogPosts = posts.filter(post => {
      const tagContent = post.tags ? post.tags.join(' ') : ''
      const searchContent = `${post.title || ''} ${post.summary || ''} ${tagContent}`
      return searchContent.toLowerCase().includes(searchValue.toLowerCase())
    })
  }
  const visiblePosts = filteredBlogPosts.slice(0, 20)

  return (
    <Container>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-200">
          {currentTag ? `#${currentTag}` : 'Search'}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">
          {currentTag ? 'Tagged articles' : 'Find articles'}
        </h1>
      </div>
      <div className="relative">
        <input
          type="text"
          placeholder={
            currentTag ? `Search in #${currentTag}` : 'Search Articles'
          }
          value={searchValue}
          className="block w-full rounded-md border border-gray-200 bg-white px-4 py-3 pr-20 text-gray-950 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-gray-800 dark:bg-night dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:border-gray-600 dark:focus:ring-gray-800"
          onChange={e => setSearchValue(e.target.value)}
        />
        {searchValue
          ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            onClick={() => setSearchValue('')}
          >
            Clear
          </button>
            )
          : (
          <svg
            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            ></path>
          </svg>
            )}
      </div>
      <Tags
        tags={tags}
        currentTag={currentTag}
      />
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {filteredBlogPosts.length} result{filteredBlogPosts.length === 1 ? '' : 's'}
        {searchValue ? ` for "${searchValue}"` : ''}
        {currentTag ? ` in #${currentTag}` : ''}
      </p>
      <div className="article-container mt-4">
        {!filteredBlogPosts.length && (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white/60 p-8 text-gray-500 dark:border-gray-800 dark:bg-white/5 dark:text-gray-400">
            <p>No posts found.</p>
            {searchValue && (
              <button
                type="button"
                className="mt-4 rounded-full bg-gray-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                onClick={() => setSearchValue('')}
              >
                Reset search
              </button>
            )}
          </div>
        )}
        {visiblePosts.map(post => (
          <BlogPost key={post.id} post={post} />
        ))}
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
