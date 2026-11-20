import test from 'node:test'
import assert from 'node:assert/strict'
import { readingMetrics, parseReadingPosition } from '../lib/reading-position.mjs'

test('progress begins at article content and completes before comments/footer', () => {
  const article = { top: 500, height: 3000, viewport: 900, offset: 100 }
  assert.equal(readingMetrics({ ...article, scrollY: 0 }).progress, 0)
  assert.equal(readingMetrics({ ...article, scrollY: 400 }).progress, 0)
  assert.equal(readingMetrics({ ...article, scrollY: 1500 }).progress, 0.5)
  assert.equal(readingMetrics({ ...article, scrollY: 2600 }).progress, 1)
  assert.equal(readingMetrics({ ...article, scrollY: 9000 }).progress, 1)
  assert.equal(readingMetrics({ ...article, height: 100, scrollY: 400 }).progress, 1)
})

test('only restores valid, unfinished and recent positions', () => {
  const now = Date.now()
  const valid = { v: 1, progress: 0.45, updatedAt: now, anchor: 'chapter-2', anchorOffset: -50 }
  assert.deepEqual(parseReadingPosition(JSON.stringify(valid), now), valid)
  for (const invalid of [null, {}, { ...valid, progress: 1 }, { ...valid, progress: -1 }, { ...valid, progress: '0.4' }, { ...valid, updatedAt: now - 91 * 86400000 }, { ...valid, updatedAt: now + 120000 }]) {
    assert.equal(parseReadingPosition(JSON.stringify(invalid), now), null)
  }
  assert.equal(parseReadingPosition('{bad'), null)
})
