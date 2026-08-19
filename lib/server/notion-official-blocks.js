/**
 * Fetches Notion block children via the official API and converts them
 * into the recordMap format expected by react-notion-x.
 */

const NOTION_API_BASE = 'https://api.notion.com/v1'

/**
 * @param {string} blockId - Notion block/page ID
 * @param {string} token - Notion integration token
 * @param {string} [notionVersion] - Notion API version header (default '2022-06-28')
 * @returns {Promise<object>} recordMap-compatible object with block, collection, collection_query, etc.
 */
export async function fetchBlocksAsRecordMap (blockId, token, notionVersion) {
  const version = notionVersion || '2022-06-28'

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': version,
    'Content-Type': 'application/json'
  }

  // 1. Fetch the page/block itself to get its metadata
  const pageResponse = await fetch(`${NOTION_API_BASE}/pages/${blockId}`, { headers })

  if (!pageResponse.ok) {
    const text = await pageResponse.text()
    throw new Error(`Notion official API failed to fetch page ${blockId}: ${pageResponse.status} ${text}`)
  }

  const page = await pageResponse.json()

  // Build recordMap
  const recordMap = {
    block: {},
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    space: {},
    user_root: {}
  }

  // Convert the page itself into a recordMap block entry
  const pageBlock = officialPageToRecordMapBlock(page)
  recordMap.block[pageBlock.value.id] = pageBlock

  // 2. Recursively fetch all child blocks
  await fetchChildBlocks(blockId, headers, recordMap)

  return recordMap
}

/**
 * Recursively fetch all children of a block and populate the recordMap.
 */
async function fetchChildBlocks (parentId, headers, recordMap) {
  let cursor

  do {
    const url = new URL(`${NOTION_API_BASE}/blocks/${parentId}/children`)
    if (cursor) url.searchParams.set('start_cursor', cursor)
    url.searchParams.set('page_size', '100')

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      const text = await response.text()
      console.warn(`[notion] Failed to fetch children of ${parentId}: ${response.status} ${text}`)
      return
    }

    const data = await response.json()
    const results = data.results || []

    for (const officialBlock of results) {
      const recordBlock = officialBlockToRecordMapBlock(officialBlock, parentId)
      recordMap.block[recordBlock.value.id] = recordBlock

      // If this block has children, recurse
      if (officialBlock.has_children) {
        await fetchChildBlocks(officialBlock.id, headers, recordMap)
      }
    }

    cursor = data.has_more ? data.next_cursor : null
  } while (cursor)
}

/**
 * Convert a Notion official API page object into a recordMap block entry.
 */
function officialPageToRecordMapBlock (page) {
  const properties = page.properties || {}

  // Extract title from the page's title property
  const titleProp = findPropertyByName(properties, 'title') ||
    findPropertyByName(properties, 'Name') ||
    Object.values(properties).find(p => p.type === 'title')

  const titleText = titleProp ? extractRichText(titleProp.title || []) : ''

  return {
    value: {
      id: page.id,
      type: 'page',
      version: 1,
      parent_id: page.parent?.page_id || page.parent?.block_id || '',
      parent_table: page.parent?.type === 'database_id' ? 'collection' : 'block',
      alive: true,
      created_time: new Date(page.created_time).getTime(),
      last_edited_time: new Date(page.last_edited_time).getTime(),
      properties: {
        title: [[titleText]]
      },
      content: [],
      format: {
        page_full_width: false
      }
    },
    role: 'editor'
  }
}

/**
 * Convert a Notion official API block object into a recordMap block entry.
 */
function officialBlockToRecordMapBlock (block, parentId) {
  const type = officialTypeToRecordMapType(block.type)

  const recordBlock = {
    value: {
      id: block.id,
      type,
      version: 1,
      parent_id: parentId,
      parent_table: 'block',
      alive: true,
      created_time: new Date(block.created_time).getTime(),
      last_edited_time: new Date(block.last_edited_time).getTime(),
      properties: {},
      content: []
    },
    role: 'editor'
  }

  const bv = recordBlock.value

  // Map properties based on block type
  switch (block.type) {
    case 'paragraph':
      bv.properties.title = [[extractRichText(block.paragraph?.rich_text || [])]]
      break

    case 'heading_1':
      bv.properties.title = [[extractRichText(block.heading_1?.rich_text || [])]]
      break

    case 'heading_2':
      bv.properties.title = [[extractRichText(block.heading_2?.rich_text || [])]]
      break

    case 'heading_3':
      bv.properties.title = [[extractRichText(block.heading_3?.rich_text || [])]]
      break

    case 'bulleted_list_item':
      bv.properties.title = [[extractRichText(block.bulleted_list_item?.rich_text || [])]]
      break

    case 'numbered_list_item':
      bv.properties.title = [[extractRichText(block.numbered_list_item?.rich_text || [])]]
      break

    case 'to_do':
      bv.properties.title = [[extractRichText(block.to_do?.rich_text || [])]]
      bv.properties.checked = [[block.to_do?.checked ? 'Yes' : 'No']]
      break

    case 'toggle':
      bv.properties.title = [[extractRichText(block.toggle?.rich_text || [])]]
      break

    case 'code': {
      const lang = block.code?.language || 'plain text'
      bv.properties.title = [[extractRichText(block.code?.rich_text || [])]]
      bv.properties.language = [[lang]]
      break
    }

    case 'quote':
      bv.properties.title = [[extractRichText(block.quote?.rich_text || [])]]
      break

    case 'callout': {
      const emoji = block.callout?.icon?.emoji || ''
      bv.properties.title = [[emoji + ' ' + extractRichText(block.callout?.rich_text || [])]]
      break
    }

    case 'image': {
      const imgType = block.image?.type
      let url = ''
      if (imgType === 'external') {
        url = block.image.external?.url || ''
      } else if (imgType === 'file') {
        url = block.image.file?.url || ''
      }
      bv.properties.title = [[block.image?.caption ? extractRichText(block.image.caption) : '']]
      bv.properties.source = [[url]]
      break
    }

    case 'video': {
      const vidType = block.video?.type
      let url = ''
      if (vidType === 'external') {
        url = block.video.external?.url || ''
      } else if (vidType === 'file') {
        url = block.video.file?.url || ''
      }
      bv.properties.title = [['']]
      bv.properties.source = [[url]]
      break
    }

    case 'file': {
      const fileType = block.file?.type
      let url = ''
      if (fileType === 'external') {
        url = block.file.external?.url || ''
      } else if (fileType === 'file') {
        url = block.file.file?.url || ''
      }
      bv.properties.title = [[block.file?.name || '']]
      bv.properties.source = [[url]]
      break
    }

    case 'bookmark':
      bv.properties.title = [[block.bookmark?.caption ? extractRichText(block.bookmark.caption) : '']]
      bv.properties.source = [[block.bookmark?.url || '']]
      break

    case 'embed':
      bv.properties.source = [[block.embed?.url || '']]
      break

    case 'equation':
      bv.properties.title = [[block.equation?.expression || '']]
      break

    case 'divider':
      break

    case 'table_of_contents':
      break

    case 'column_list':
      break

    case 'column':
      break

    case 'table':
      bv.properties.table_width = [[String(block.table?.table_width || 0)]]
      bv.properties.has_column_header = [[block.table?.has_column_header ? 'Yes' : 'No']]
      bv.properties.has_row_header = [[block.table?.has_row_header ? 'Yes' : 'No']]
      break

    case 'table_row':
      bv.properties.title = [
        (block.table_row?.cells || []).map(cell => extractRichText(cell))
      ]
      break

    case 'child_page':
      bv.properties.title = [[block.child_page?.title || '']]
      break

    case 'child_database':
      bv.properties.title = [[block.child_database?.title || '']]
      break

    case 'link_preview':
      bv.properties.source = [[block.link_preview?.url || '']]
      break

    case 'pdf': {
      const pdfType = block.pdf?.type
      let url = ''
      if (pdfType === 'external') {
        url = block.pdf.external?.url || ''
      } else if (pdfType === 'file') {
        url = block.pdf.file?.url || ''
      }
      bv.properties.title = [[block.pdf?.caption ? extractRichText(block.pdf.caption) : '']]
      bv.properties.source = [[url]]
      break
    }

    default:
      if (block[block.type]?.rich_text) {
        bv.properties.title = [[extractRichText(block[block.type].rich_text)]]
      }
      break
  }

  return recordBlock
}

/**
 * Map official API block type to react-notion-x recordMap type name.
 */
function officialTypeToRecordMapType (officialType) {
  const typeMap = {
    paragraph: 'text',
    heading_1: 'header',
    heading_2: 'sub_header',
    heading_3: 'sub_sub_header',
    bulleted_list_item: 'bulleted_list',
    numbered_list_item: 'numbered_list',
    to_do: 'to_do',
    toggle: 'toggle',
    code: 'code',
    quote: 'quote',
    callout: 'callout',
    image: 'image',
    video: 'video',
    file: 'file',
    bookmark: 'bookmark',
    embed: 'embed',
    equation: 'equation',
    divider: 'divider',
    table_of_contents: 'table_of_contents',
    column_list: 'column_list',
    column: 'column',
    table: 'table',
    table_row: 'table_row',
    child_page: 'page',
    child_database: 'collection_view',
    link_preview: 'link_preview',
    pdf: 'pdf'
  }

  return typeMap[officialType] || officialType
}

/**
 * Extract plain text from Notion rich_text array.
 */
function extractRichText (richText = []) {
  return richText.map(text => text.plain_text || '').join('')
}

/**
 * Find a property by name (case-insensitive).
 */
function findPropertyByName (properties, name) {
  const lower = name.toLowerCase()
  const key = Object.keys(properties).find(k => k.toLowerCase() === lower)
  return key ? properties[key] : null
}
