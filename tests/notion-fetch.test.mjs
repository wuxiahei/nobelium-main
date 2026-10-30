import assert from 'node:assert/strict'
import test from 'node:test'
import { notionFetch } from '../lib/server/notion-fetch.mjs'

const TEST_OPTIONS = {
  maxRetries: 2,
  requestIntervalMs: 0,
  retryBaseMs: 1
}

test('notionFetch retries a rate-limited request and returns the next response', async () => {
  let calls = 0
  const fakeFetch = async () => {
    calls += 1
    if (calls === 1) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '0' }
      })
    }
    return new Response('{"ok":true}', { status: 200 })
  }

  const response = await notionFetch('https://api.notion.test/v1/pages/example', {}, {
    ...TEST_OPTIONS,
    fetch: fakeFetch
  })

  assert.equal(response.status, 200)
  assert.equal(calls, 2)
})

test('notionFetch does not retry non-retryable responses', async () => {
  let calls = 0
  const fakeFetch = async () => {
    calls += 1
    return new Response('bad request', { status: 400 })
  }

  const response = await notionFetch('https://api.notion.test/v1/pages/example', {}, {
    ...TEST_OPTIONS,
    fetch: fakeFetch
  })

  assert.equal(response.status, 400)
  assert.equal(calls, 1)
})

test('notionFetch returns the final response after exhausting retries', async () => {
  let calls = 0
  const fakeFetch = async () => {
    calls += 1
    return new Response('still limited', {
      status: 429,
      headers: { 'retry-after': '0' }
    })
  }

  const response = await notionFetch('https://api.notion.test/v1/pages/example', {}, {
    ...TEST_OPTIONS,
    fetch: fakeFetch
  })

  assert.equal(response.status, 429)
  assert.equal(calls, 3)
})
