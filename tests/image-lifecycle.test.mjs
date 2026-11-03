import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countImageReferences,
  extractManagedImagePathnames,
  isManagedImageSource,
  normalizeManagedPathname
} from '../lib/image-lifecycle.mjs'

test('normalizes managed blob URLs and rejects arbitrary paths', () => {
  assert.equal(
    normalizeManagedPathname('https://store.public.blob.vercel-storage.com/nobelium/images/2026/11/webp-cover.webp?download=1'),
    'nobelium/images/2026/11/webp-cover.webp'
  )
  assert.equal(normalizeManagedPathname('/nobelium/images/2026/11/webp-%E5%B0%81%E9%9D%A2.webp'), 'nobelium/images/2026/11/webp-封面.webp')
  assert.equal(normalizeManagedPathname('https://example.com/nobelium/images/cover.webp'), 'nobelium/images/cover.webp')
  assert.equal(normalizeManagedPathname('nobelium/images/../../secret.txt'), '')
  assert.equal(normalizeManagedPathname('https://example.com/other.webp'), '')
  assert.equal(isManagedImageSource('not-a-url'), false)
})

test('extracts unique managed images from Markdown while ignoring external images', () => {
  const content = `![封面](https://blob.example/nobelium/images/2026/11/cover.webp)

![外部](https://example.com/photo.webp)

![封面二](https://blob.example/nobelium/images/2026/11/cover.webp)
`

  assert.deepEqual(extractManagedImagePathnames(content), ['nobelium/images/2026/11/cover.webp'])
  assert.equal(countImageReferences([content, 'no image'], 'nobelium/images/2026/11/cover.webp'), 1)
})
