import assert from 'node:assert/strict'
import test from 'node:test'
import { runContentPreflight } from '../lib/content-preflight.mjs'

test('publish preflight blocks missing content, invalid metadata, and duplicate slugs', () => {
  const result = runContentPreflight({
    title: '新文章',
    slug: 'hello world',
    summary: 'x'.repeat(301),
    tags: Array.from({ length: 9 }, (_, index) => 'tag-' + index).join(','),
    content: '![](data:image/png;base64,abc)'
  }, {
    mode: 'publish',
    currentNumber: 2,
    posts: [{ githubIssueNumber: 1, slug: 'hello world' }]
  })

  assert.equal(result.ready, false)
  assert.ok(result.errors.some(issue => issue.code === 'slug-format'))
  assert.ok(result.errors.some(issue => issue.code === 'summary-long'))
  assert.ok(result.errors.some(issue => issue.code === 'tags-too-many'))
  assert.ok(result.errors.some(issue => issue.code === 'image-data-url'))
  assert.ok(result.warnings.some(issue => issue.code === 'image-alt'))
})

test('draft preflight reports empty body as a warning and excludes the current slug', () => {
  const result = runContentPreflight({
    title: '草稿标题',
    slug: 'current-post',
    tags: 'Next.js, Next.js',
    content: ''
  }, {
    mode: 'draft',
    currentNumber: 12,
    posts: [{ githubIssueNumber: 12, slug: 'current-post' }]
  })

  assert.equal(result.ready, true)
  assert.ok(result.warnings.some(issue => issue.code === 'content-empty'))
  assert.ok(result.warnings.some(issue => issue.code === 'tag-duplicate'))
  assert.equal(result.errors.some(issue => issue.code === 'slug-duplicate'), false)
})

test('preflight accepts a clean article with managed image and HTTPS link', () => {
  const result = runContentPreflight({
    title: '发布就绪',
    slug: 'ready-to-publish',
    summary: '一段清楚的摘要。',
    tags: 'Next.js, Vercel',
    content: '正文内容。\n\n![封面](https://example.com/cover.webp)\n\n[参考](https://example.com/reference)'
  }, { mode: 'publish' })

  assert.equal(result.ready, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 0)
  assert.equal(result.imageCount, 1)
})
