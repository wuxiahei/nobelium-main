const TEXT_FIELDS = ['title', 'slug', 'summary', 'password']
const LIST_FIELDS = ['tags', 'category', 'status', 'type']

export function normalizePostMetadata (post) {
  const normalized = { ...post }

  for (const field of TEXT_FIELDS) {
    if (!(field in normalized)) continue
    normalized[field] = normalizeText(normalized[field])
  }

  for (const field of LIST_FIELDS) {
    if (!Array.isArray(normalized[field])) continue

    normalized[field] = normalized[field]
      .map(normalizeText)
      .filter(Boolean)
  }

  return normalized
}

function normalizeText (value) {
  if (typeof value !== 'string') return value
  return value.replace(/[\u00a0\u3000]/g, ' ').trim()
}
