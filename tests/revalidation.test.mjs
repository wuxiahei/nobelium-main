import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFullSiteRevalidationPaths,
  dedupeRevalidationPaths,
  getRequestedRevalidationPaths,
  isAuthorizedRevalidationRequest,
  isValidRevalidationPath
} from '../lib/server/revalidate.mjs'

test('accepts only the configured bearer secret', () => {
  assert.equal(isAuthorizedRevalidationRequest('Bearer test-secret', 'test-secret'), true)
  assert.equal(isAuthorizedRevalidationRequest('bearer test-secret', 'test-secret'), true)
  assert.equal(isAuthorizedRevalidationRequest('Bearer wrong-secret', 'test-secret'), false)
  assert.equal(isAuthorizedRevalidationRequest(undefined, 'test-secret'), false)
  assert.equal(isAuthorizedRevalidationRequest('Basic test-secret', 'test-secret'), false)
  assert.equal(isAuthorizedRevalidationRequest('Bearer test-secret', ''), false)
})

test('rejects external, protocol-relative, and ambiguous paths', () => {
  for (const path of [
    'https://example.com/',
    '//example.com/',
    '/?preview=1',
    '/post#section',
    '/post?preview=1',
    '/a//b',
    '/a/../b',
    '/a/%2e%2e/b',
    '/a\\b',
    '/raw space'
  ]) {
    assert.equal(isValidRevalidationPath(path), false, path)
  }

  for (const path of ['/', '/search', '/my-post', '/tag/Computer%20Science', '/中文']) {
    assert.equal(isValidRevalidationPath(path), true, path)
  }
})

test('parses targeted paths and deduplicates them', () => {
  assert.deepEqual(
    getRequestedRevalidationPaths({ paths: ['/', '/', '/search', '/my-post'] }),
    ['/', '/search', '/my-post']
  )
  assert.equal(getRequestedRevalidationPaths({}), null)
  assert.equal(getRequestedRevalidationPaths(undefined), null)
  assert.deepEqual(dedupeRevalidationPaths(['/a', '/b', '/a']), ['/a', '/b'])
  assert.throws(
    () => getRequestedRevalidationPaths({ paths: ['https://example.com'] }),
    /Invalid site paths/
  )
  assert.throws(
    () => getRequestedRevalidationPaths({ paths: [] }),
    /non-empty array/
  )
})

test('builds pagination, content, page, and tag paths from Notion data', () => {
  const posts = [
    { slug: 'one', type: ['Post'] },
    { slug: 'two', type: ['Post'] },
    { slug: 'three', type: ['Post'] },
    { slug: 'four', type: ['Post'] },
    { slug: 'five', type: ['Post'] },
    { slug: 'about', type: ['Page'] },
    { slug: 'second page', type: ['Post'] },
    { slug: 'draft', type: ['Post'] }
  ]

  const paths = buildFullSiteRevalidationPaths({
    posts,
    tags: ['AI', 'C++', '机器 学习'],
    postsPerPage: 3
  })

  assert.deepEqual(paths, [
    '/',
    '/search',
    '/page/2',
    '/page/3',
    '/one',
    '/two',
    '/three',
    '/four',
    '/five',
    '/about',
    '/second%20page',
    '/draft',
    '/tag/AI',
    '/tag/C%2B%2B',
    '/tag/%E6%9C%BA%E5%99%A8%20%E5%AD%A6%E4%B9%A0'
  ])
})

test('supports a configured path prefix without duplicating slashes', () => {
  const paths = buildFullSiteRevalidationPaths({
    posts: [{ slug: 'hello world', type: ['Post'] }],
    tags: ['Notes'],
    postsPerPage: 7,
    pathPrefix: '/blog/'
  })

  assert.deepEqual(paths, [
    '/blog',
    '/blog/search',
    '/blog/hello%20world',
    '/blog/tag/Notes'
  ])
})
