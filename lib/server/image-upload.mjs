export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', label: 'JPEG' },
  'image/png': { extension: 'png', label: 'PNG' },
  'image/webp': { extension: 'webp', label: 'WebP' },
  'image/gif': { extension: 'gif', label: 'GIF' }
}

export function parseImageDataUrl (value) {
  const source = String(value || '')
  const match = source.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) {
    throw new Error('仅支持 JPEG、PNG、WebP 或 GIF 图片。')
  }

  const mimeType = match[1].toLowerCase()
  const metadata = IMAGE_TYPES[mimeType]
  if (!metadata) throw new Error('图片格式不受支持。')

  const normalizedBase64 = match[2].replace(/\s/g, '')
  const buffer = Buffer.from(normalizedBase64, 'base64')
  if (!buffer.length) throw new Error('图片内容为空。')
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('图片不能超过 3 MB。')
  }
  if (!matchesImageSignature(buffer, mimeType)) {
    throw new Error('图片内容与文件格式不匹配。')
  }

  return {
    buffer,
    mimeType,
    extension: metadata.extension,
    label: metadata.label,
    size: buffer.length
  }
}

export function createImagePathname (fileName, image, now = new Date()) {
  const folder = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0')].join('/')
  const baseName = String(fileName || 'image')
    .normalize('NFKC')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'image'
  return 'nobelium/images/' + folder + '/' + image.extension + '-' + baseName
}

function matchesImageSignature (buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mimeType === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}