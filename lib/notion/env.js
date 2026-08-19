export const NOTION_TOKEN_ENV_KEYS = [
  'NOTION_API_KEY',
  'NOTION_TOKEN',
  'NOTION_INTEGRATION_TOKEN',
  'NOTION_API_TOKEN',
  'NOTION_AUTH_TOKEN',
  'NOTION_SECRET'
]

export function getNotionToken () {
  for (const key of NOTION_TOKEN_ENV_KEYS) {
    const value = process.env[key]
    if (value && value.trim()) return value.trim()
  }
  return null
}

export function describeNotionEnv () {
  const keys = [
    ...NOTION_TOKEN_ENV_KEYS,
    'NOTION_DATA_SOURCE_ID',
    'NOTION_DATABASE_ID',
    'NOTION_PAGE_ID',
    'NOTION_ACCESS_TOKEN',
    'NOTION_VERSION'
  ]

  return keys
    .map(key => `${key}=${process.env[key] ? 'set' : 'unset'}`)
    .join(', ')
}
