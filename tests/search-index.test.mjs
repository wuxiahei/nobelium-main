import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cleanMarkdownForSearch,
  filterAndScorePosts,
  recordMapToSearchText,
  scoreSearchPost,
  splitSearchHighlight,
  tokenizeSearchQuery
} from '../lib/search-index.mjs'

test('ranks title matches above body-only matches', () => {
  const posts = [
    { slug: 'body', title: '部署记录', summary: '', tags: [], searchText: 'Vercel 缓存刷新策略' },
    { slug: 'title', title: 'Vercel 缓存指南', summary: '', tags: [], searchText: '刷新策略' }
  ]

  assert.equal(filterAndScorePosts(posts, 'Vercel 缓存')[0].post.slug, 'title')
})

test('supports Chinese queries and multiple keywords across fields', () => {
  const post = {
    title: '用 Notion 管理文章',
    tags: ['写作'],
    summary: '保留可视化编辑',
    searchText: 'Vercel 负责部署，GitHub Issue 负责发布。'
  }

  assert.equal(tokenizeSearchQuery('Notion，写作').length, 2)
  assert.equal(scoreSearchPost(post, 'Notion 写作').matched, true)
  assert.equal(scoreSearchPost(post, 'Vercel GitHub').matched, true)
  assert.equal(scoreSearchPost(post, 'Notion 数据库').matched, false)
})

test('returns a body snippet around the first matching keyword', () => {
  const body = '开头内容'.repeat(100) + '这里讨论增量静态再生成与缓存刷新。' + '结尾内容'.repeat(100)
  const result = scoreSearchPost({ title: '缓存', searchText: body }, '缓存刷新')

  assert.equal(result.matched, true)
  assert.match(result.snippet, /缓存刷新/)
  assert.ok(result.snippet.startsWith('…'))
  assert.ok(result.snippet.endsWith('…'))
})

test('cleans common Markdown syntax for a static search index', () => {
  const markdown = [
    '---',
    'title: Hidden metadata',
    '---',
    '# 可见标题',
    '',
    '正文包含 [链接文字](https://example.com)、**强调** 与 ![图片说明](image.png)。',
    '',
    '```js',
    'const cache = true',
    '```'
  ].join('\n')
  const text = cleanMarkdownForSearch(markdown)

  assert.doesNotMatch(text, /Hidden metadata/)
  assert.match(text, /可见标题/)
  assert.match(text, /链接文字/)
  assert.match(text, /图片说明/)
  assert.match(text, /const cache = true/)
  assert.doesNotMatch(text, /```/)
})

test('extracts searchable text from a Notion record map in page order', () => {
  const recordMap = {
    block: {
      root: {
        value: {
          id: 'root',
          type: 'page',
          properties: { title: [[{ plain_text: '页面标题' }]] },
          content: ['heading', 'paragraph']
        }
      },
      heading: {
        value: {
          id: 'heading',
          type: 'header',
          properties: { title: [[{ plain_text: '第一部分' }]] }
        }
      },
      paragraph: {
        value: {
          id: 'paragraph',
          type: 'text',
          properties: { title: [[{ plain_text: '正文内容' }]] }
        }
      }
    }
  }

  assert.equal(recordMapToSearchText(recordMap), '页面标题 第一部分 正文内容')
})

test('splits highlight ranges without losing unmatched text', () => {
  const parts = splitSearchHighlight('Vercel 缓存与刷新', 'vercel 缓存')

  assert.equal(parts.map(part => part.text).join(''), 'Vercel 缓存与刷新')
  assert.equal(parts.filter(part => part.match).length, 2)
})