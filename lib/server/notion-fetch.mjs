const NOTION_API_BASE = 'https://api.notion.com/v1'

const DEFAULT_MAX_RETRIES = 6
const DEFAULT_REQUEST_INTERVAL_MS = 340
const DEFAULT_RETRY_BASE_MS = 1000
const MAX_RETRY_DELAY_MS = 15000

let requestQueue = Promise.resolve()
let lastRequestAt = 0

export { NOTION_API_BASE }

/**
 * Fetch a Notion API resource with process-wide throttling and retries.
 * Notion limits integrations to an average of three requests per second.
 */
export function notionFetch (url, init = {}, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available.')
  }

  const maxRetries = parseNonNegativeInteger(
    options.maxRetries ?? process.env.NOTION_MAX_RETRIES,
    DEFAULT_MAX_RETRIES
  )
  const requestIntervalMs = parseNonNegativeInteger(
    options.requestIntervalMs ?? process.env.NOTION_REQUEST_INTERVAL_MS,
    DEFAULT_REQUEST_INTERVAL_MS
  )
  const retryBaseMs = parseNonNegativeInteger(
    options.retryBaseMs ?? process.env.NOTION_RETRY_BASE_MS,
    DEFAULT_RETRY_BASE_MS
  )

  const request = requestQueue.then(
    () => fetchWithRetry(fetchImpl, url, init, {
      maxRetries,
      requestIntervalMs,
      retryBaseMs
    }),
    () => fetchWithRetry(fetchImpl, url, init, {
      maxRetries,
      requestIntervalMs,
      retryBaseMs
    })
  )

  requestQueue = request.catch(() => {})
  return request
}

async function fetchWithRetry (fetchImpl, url, init, options) {
  for (let attempt = 0; ; attempt++) {
    await waitForRequestSlot(options.requestIntervalMs)

    let response
    try {
      response = await fetchImpl(url, init)
    } catch (error) {
      if (attempt >= options.maxRetries || error?.name === 'AbortError') throw error

      const delay = getRetryDelay(null, attempt, options.retryBaseMs)
      logRetry(`network error: ${error?.message || error}`, delay)
      await sleep(delay)
      continue
    }

    if (!isRetryableStatus(response.status) || attempt >= options.maxRetries) {
      return response
    }

    const delay = getRetryDelay(response, attempt, options.retryBaseMs)
    logRetry(`HTTP ${response.status}`, delay)
    await discardResponse(response)
    await sleep(delay)
  }
}

async function waitForRequestSlot (requestIntervalMs) {
  const waitMs = lastRequestAt + requestIntervalMs - Date.now()
  if (waitMs > 0) await sleep(waitMs)
  lastRequestAt = Date.now()
}

function isRetryableStatus (status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function getRetryDelay (response, attempt, retryBaseMs) {
  const retryAfterMs = parseRetryAfter(response?.headers?.get?.('retry-after'))
  if (retryAfterMs !== null) return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS)

  const exponentialDelay = retryBaseMs * 2 ** attempt
  const jitter = Math.floor(Math.random() * Math.max(retryBaseMs, 1))
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS)
}

function parseRetryAfter (value) {
  if (value === null || value === undefined || value === '') return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }

  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0)

  return null
}

async function discardResponse (response) {
  try {
    await response.body?.cancel?.()
  } catch {
    // The retry should continue even if the response body cannot be cancelled.
  }
}

function logRetry (reason, delay) {
  console.warn(`[notion] Request failed (${reason}). Retrying in ${delay}ms.`)
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseNonNegativeInteger (value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}
