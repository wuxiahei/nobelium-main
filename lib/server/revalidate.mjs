import { createHash, timingSafeEqual } from 'node:crypto'

const INVALID_PATH_CHARACTERS = /[\u0000-\u0020\u007f\\?#]/
const ENCODED_DOT_OR_SEPARATOR = /%(?:2e|2f|5c)/i
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/

export function isAuthorizedRevalidationRequest (authorization, secret) {
  if (typeof authorization !== 'string' || typeof secret !== 'string' || !secret) {
    return false
  }

  const parts = authorization.trim().split(/\s+/)
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return false
  }

  const providedHash = hashSecret(parts[1])
  const expectedHash = hashSecret(secret)
  return timingSafeEqual(providedHash, expectedHash)
}

export function isValidRevalidationPath (path) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    INVALID_PATH_CHARACTERS.test(path) ||
    ENCODED_DOT_OR_SEPARATOR.test(path) ||
    DOT_SEGMENT.test(path)
  ) {
    return false
  }

  if (path !== '/') {
    const segments = path.slice(1).split('/')
    if (segments.some(segment => !segment)) return false
  }

  try {
    decodeURI(path)
    const url = new URL(path, 'https://revalidation.invalid')
    return url.origin === 'https://revalidation.invalid'
  } catch {
    return false
  }
}

export function dedupeRevalidationPaths (paths) {
  return [...new Set(paths)]
}

export function getRequestedRevalidationPaths (body) {
  if (body === undefined || body === null || body === '') return null

  let payload = body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      throw new Error('Request body must be valid JSON.')
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Request body must be a JSON object.')
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'paths')) return null
  if (!Array.isArray(payload.paths) || payload.paths.length === 0) {
    throw new Error('paths must be a non-empty array.')
  }

  const invalidPaths = payload.paths.filter(path => !isValidRevalidationPath(path))
  if (invalidPaths.length > 0) {
    throw new Error(`Invalid site paths: ${invalidPaths.map(String).join(', ')}`)
  }

  return dedupeRevalidationPaths(payload.paths)
}

export function buildFullSiteRevalidationPaths ({
  posts = [],
  tags = [],
  postsPerPage,
  pathPrefix = ''
}) {
  const perPage = Number(postsPerPage)
  if (!Number.isInteger(perPage) || perPage <= 0) {
    throw new Error('postsPerPage must be a positive integer.')
  }

  const prefix = normalizePathPrefix(pathPrefix)
  const postEntries = posts.filter(isPost)
  const homePosts = postEntries.filter(post => post.slug !== 'about')
  const totalPages = Math.ceil(homePosts.length / perPage)
  const tagNames = Array.isArray(tags) ? tags : Object.keys(tags || {})

  const paths = [
    withPrefix(prefix, '/'),
    withPrefix(prefix, '/search')
  ]

  for (let page = 2; page <= totalPages; page++) {
    paths.push(withPrefix(prefix, `/page/${page}`))
  }

  for (const post of posts) {
    if (!post?.slug) continue
    paths.push(withPrefix(prefix, `/${encodeURIComponent(post.slug)}`))
  }

  for (const tag of tagNames) {
    if (!tag) continue
    paths.push(withPrefix(prefix, `/tag/${encodeURIComponent(tag)}`))
  }

  return dedupeRevalidationPaths(paths)
}

function hashSecret (value) {
  return createHash('sha256').update(value).digest()
}

function isPost (post) {
  return post?.type?.[0] === 'Post'
}

function normalizePathPrefix (value) {
  if (!value) return ''

  let prefix = String(value).trim()
  if (!prefix.startsWith('/')) prefix = `/${prefix}`
  prefix = prefix.replace(/\/+$/, '')

  if (!prefix || prefix === '/') return ''
  if (!isValidRevalidationPath(prefix)) {
    throw new Error(`Invalid path prefix: ${value}`)
  }
  return prefix
}

function withPrefix (prefix, path) {
  if (path === '/') return prefix || '/'
  return `${prefix}${path}`
}
