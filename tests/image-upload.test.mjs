import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_IMAGE_BYTES,
  createImagePathname,
  parseImageDataUrl
} from '../lib/server/image-upload.mjs'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const PNG_DATA_URL = 'data:image/png;base64,' + PNG_BYTES.toString('base64')

test('accepts supported image data URLs and validates their signature', () => {
  const image = parseImageDataUrl(PNG_DATA_URL)
  assert.equal(image.mimeType, 'image/png')
  assert.equal(image.extension, 'png')
  assert.equal(image.size, PNG_BYTES.length)
})

test('rejects unsupported types, forged signatures, and oversized images', () => {
  assert.throws(
    () => parseImageDataUrl('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')),
    /仅支持/
  )
  assert.throws(
    () => parseImageDataUrl('data:image/png;base64,' + Buffer.from('not a png').toString('base64')),
    /内容与文件格式不匹配/
  )
  const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1)
  oversized.set(PNG_BYTES)
  assert.throws(
    () => parseImageDataUrl('data:image/png;base64,' + oversized.toString('base64')),
    /3 MB/
  )
})

test('creates a stable, readable Vercel Blob pathname', () => {
  const image = { extension: 'webp' }
  assert.equal(
    createImagePathname('我的 图片 01.png', image, new Date('2026-11-03T12:00:00Z')),
    'nobelium/images/2026/11/webp-我的-图片-01'
  )
})