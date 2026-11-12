import assert from 'node:assert/strict'
import test from 'node:test'
import { getPostListDate, sortPosts } from '../lib/post-order.mjs'
import { filterAndScorePosts } from '../lib/search-index.mjs'

test('an edited Notion article moves ahead of a newer GitHub publication', () => {
  const posts = [
    { slug: 'github-new', source: 'github', date: Date.parse('2026-11-10T08:00:00Z'), updatedAt: '2026-11-10T08:00:00Z' },
    { slug: 'notion-old', source: 'notion', date: Date.parse('2021-01-01T00:00:00Z'), updatedAt: '2026-11-11T08:00:00Z' }
  ]
  const original = structuredClone(posts)

  assert.deepEqual(sortPosts(posts).map(post => post.slug), ['notion-old', 'github-new'])
  assert.deepEqual(posts, original)
  assert.equal(getPostListDate(posts[1]).timestamp, Date.parse('2026-11-11T08:00:00Z'))
  assert.equal(getPostListDate(posts[1]).updated, true)
})

test('missing or invalid update times fall back to numeric or ISO publication dates', () => {
  const posts = [
    { slug: 'invalid', updatedAt: 'invalid', date: Date.parse('2026-11-09T00:00:00Z') },
    { slug: 'missing', date: '2026-11-11T00:00:00Z' },
    { slug: 'empty', updatedAt: '', date: '2026-11-10T00:00:00Z' }
  ]

  assert.deepEqual(sortPosts(posts).map(post => post.slug), ['missing', 'empty', 'invalid'])
  for (const post of posts) {
    assert.equal(getPostListDate(post).updated, false)
    assert.equal(getPostListDate(post).timestamp, new Date(post.date).getTime())
  }
})

test('compares timestamp values rather than ISO strings or source-specific types', () => {
  const posts = [
    { slug: 'local', updatedAt: '2026-11-11T08:30:00+08:00' },
    { slug: 'utc', updatedAt: '2026-11-11T01:00:00Z' },
    { slug: 'numeric', updatedAt: Date.parse('2026-11-11T02:00:00Z') }
  ]

  assert.deepEqual(sortPosts(posts).map(post => post.slug), ['numeric', 'utc', 'local'])
  assert.deepEqual(getPostListDate({ updatedAt: 0 }), { timestamp: 0, updated: true })
})

test('equal update times use publication time then a stable key for pagination', () => {
  const posts = [
    { slug: 'b', updatedAt: '2026-11-11T08:00:00+08:00', date: '2026-11-01' },
    { slug: 'newer-publication', updatedAt: '2026-11-11T00:00:00Z', date: '2026-11-02' },
    { slug: 'a', updatedAt: '2026-11-11T00:00:00Z', date: '2026-11-01' }
  ]
  const expected = ['newer-publication', 'a', 'b']

  assert.deepEqual(sortPosts(posts).map(post => post.slug), expected)
  assert.deepEqual(sortPosts([...posts].reverse()).map(post => post.slug), expected)
})

test('unusable dates sort last without inventing a current date', () => {
  const posts = [
    { slug: 'unknown', updatedAt: 'invalid', date: 'invalid' },
    { slug: 'known', date: '2026-11-10' }
  ]

  assert.deepEqual(sortPosts(posts).map(post => post.slug), ['known', 'unknown'])
  for (const value of [undefined, null, '', ' ', 'invalid', NaN, Infinity, true, {}]) {
    assert.deepEqual(getPostListDate({ updatedAt: value, date: value }), { timestamp: null, updated: false })
  }
})

test('publication and custom ordering remain available without changing post data', () => {
  const posts = [
    { slug: 'edited-old', date: '2021-01-01', updatedAt: '2026-11-11' },
    { slug: 'published-new', date: '2026-11-10', updatedAt: '2026-11-10' }
  ]

  assert.deepEqual(sortPosts(posts, 'date').map(post => post.slug), ['published-new', 'edited-old'])
  assert.deepEqual(sortPosts(posts, 'none'), posts)
  assert.notEqual(sortPosts(posts, 'none'), posts)
  assert.deepEqual(getPostListDate(posts[0], 'date'), { timestamp: Date.parse('2021-01-01'), updated: false })
})

test('keyword search keeps relevance first and update order for equally relevant articles', () => {
  const posts = sortPosts([
    { slug: 'body-old', title: '部署记录', searchText: 'Vercel', updatedAt: '2026-11-09' },
    { slug: 'body-new', title: '部署记录', searchText: 'Vercel', updatedAt: '2026-11-11' },
    { slug: 'title', title: 'Vercel', updatedAt: '2026-11-08' }
  ])

  assert.deepEqual(filterAndScorePosts(posts, '').map(result => result.post.slug), ['body-new', 'body-old', 'title'])
  assert.deepEqual(filterAndScorePosts(posts, 'Vercel').map(result => result.post.slug), ['title', 'body-new', 'body-old'])
})
