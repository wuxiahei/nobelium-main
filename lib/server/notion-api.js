import { NotionAPI } from 'notion-client'

const { NOTION_ACCESS_TOKEN } = process.env

const client = new NotionAPI({ authToken: NOTION_ACCESS_TOKEN })
const rawFetch = client.fetch.bind(client)
const maxRetries = parseInteger(process.env.NOTION_MAX_RETRIES, 6)
const retryBaseMs = parseInteger(process.env.NOTION_RETRY_BASE_MS, 1000)
const requestIntervalMs = parseInteger(
  process.env.NOTION_REQUEST_INTERVAL_MS,
  250
)
let requestQueue = Promise.resolve()
let lastRequestAt = 0

client.fetch = async function (...args) {
  const request = requestQueue.then(
    () => fetchWithRetry(args),
    () => fetchWithRetry(args)
  )
  requestQueue = request.catch(() => {})
  return request
}

async function fetchWithRetry (args) {
  for (let attempt = 0; ; attempt++) {
    await waitForRequestSlot()

    try {
      const response = await rawFetch(...args)
      normalizeNotionResponse(response)
      return response
    } catch (error) {
      if (!shouldRetry(error, attempt)) throw error

      const delay = getRetryDelay(error, attempt)
      console.warn(
        `[notion] Request limited by Notion (${getStatusCode(error)}). Retrying in ${delay}ms.`
      )
      await sleep(delay)
    }
  }
}

async function waitForRequestSlot () {
  const waitMs = lastRequestAt + requestIntervalMs - Date.now()
  if (waitMs > 0) await sleep(waitMs)
  lastRequestAt = Date.now()
}

function shouldRetry (error, attempt) {
  if (attempt >= maxRetries) return false

  const statusCode = getStatusCode(error)
  return statusCode === 429 || statusCode === 500 || statusCode === 503
}

function getRetryDelay (error, attempt) {
  const retryAfter = error?.response?.headers?.get?.('retry-after')
  const retryAfterMs = Number(retryAfter) * 1000

  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs
  }

  const exponentialDelay = retryBaseMs * 2 ** attempt
  const jitter = Math.floor(Math.random() * retryBaseMs)
  return Math.min(exponentialDelay + jitter, 15000)
}

function getStatusCode (error) {
  return error?.statusCode || error?.status || error?.response?.status
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseInteger (value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNotionResponse (response) {
  normalizeRecordMap(response?.recordMap)
  normalizeRecordMap(response?.recordMapWithRoles)
}

function normalizeRecordMap (recordMap) {
  if (!recordMap || typeof recordMap !== 'object') return

  for (const table of Object.values(recordMap)) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) continue

    for (const [id, entry] of Object.entries(table)) {
      table[id] = normalizeRecordEntry(entry)
    }
  }
}

function normalizeRecordEntry (entry) {
  const nestedValue = entry?.value?.value

  if (!isNotionRecordValue(nestedValue)) return entry

  return {
    ...entry,
    ...entry.value,
    value: nestedValue,
    role: entry.value.role ?? entry.role
  }
}

function isNotionRecordValue (value) {
  return (
    value &&
    typeof value === 'object' &&
    (value.id || value.type || value.schema || value.name)
  )
}

export default client
