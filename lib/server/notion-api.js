import { NotionAPI } from 'notion-client'

const { NOTION_ACCESS_TOKEN } = process.env

const client = new NotionAPI({ authToken: NOTION_ACCESS_TOKEN })
const fetch = client.fetch.bind(client)

client.fetch = async function (...args) {
  const response = await fetch(...args)
  normalizeNotionResponse(response)
  return response
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
