import { config as BLOG } from '@/lib/server/config'

import { getBlockCollectionId, idToUuid } from 'notion-utils'
import dayjs from 'dayjs'
import api from '@/lib/server/notion-api'
import getAllPageIds from './getAllPageIds'
import getPageProperties from './getPageProperties'
import filterPublishedPosts from './filterPublishedPosts'

/**
 * @param {{ includePages: boolean }} - false: posts only / true: include pages
 */
export async function getAllPosts ({ includePages = false }) {
  const notionPageId = BLOG.notionPageId || process.env.NOTION_PAGE_ID
  const id = idToUuid(notionPageId)

  if (!id) {
    console.warn(
      '[notion] NOTION_PAGE_ID is missing or invalid. Skipping static post generation.'
    )
    return []
  }

  let response
  try {
    response = await api.getPage(id)
  } catch (error) {
    console.warn(
      `[notion] Failed to load Notion page "${id}". Check NOTION_PAGE_ID, sharing permissions, and NOTION_ACCESS_TOKEN.`
    )
    console.warn(error?.message || error)
    return []
  }

  const block = response.block
  const rawMetadata = block?.[id]?.value

  const database = getDatabaseContext(response, id)

  if (!database) {
    console.warn(
      `pageId "${id}" is not a database and no child database was found`
    )
    return []
  }

  if (database.blockId !== id && rawMetadata?.type === 'page') {
    console.warn(
      `pageId "${id}" is a page. Using child database "${database.blockId}".`
    )
  }

  const { collectionQuery, schema } = database

  if (!collectionQuery || !block || !schema) {
    console.warn(
      `pageId "${database.blockId}" does not contain a readable database schema`
    )
    return []
  }

  // Construct Data
  const pageIds = getAllPageIds(collectionQuery)
  const data = []
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]
    const properties = (await getPageProperties(id, block, schema)) || null
    if (!properties) continue

    // Add fullwidth to properties
    properties.fullWidth = block[id]?.value?.format?.page_full_width ?? false
    // Convert date (with timezone) to unix milliseconds timestamp
    properties.date = (
      properties.date?.start_date
        ? dayjs.tz(properties.date?.start_date)
        : dayjs(block[id]?.value?.created_time)
    ).valueOf()

    data.push(properties)
  }

  // remove all the the items doesn't meet requirements
  const posts = filterPublishedPosts({ posts: data, includePages })

  // Sort by date
  if (BLOG.sortByDate) {
    posts.sort((a, b) => b.date - a.date)
  }
  return posts
}

function getDatabaseContext (recordMap, rootId) {
  const blockMap = recordMap.block || {}
  const rootBlock = blockMap[rootId]?.value
  const candidates = []

  if (isDatabaseBlock(rootBlock)) {
    candidates.push(rootBlock)
  }

  for (const childId of rootBlock?.content || []) {
    const childBlock = blockMap[childId]?.value
    if (isDatabaseBlock(childBlock)) {
      candidates.push(childBlock)
    }
  }

  for (const block of Object.values(blockMap)) {
    if (isDatabaseBlock(block?.value)) {
      candidates.push(block.value)
    }
  }

  for (const block of candidates) {
    const collectionId = getBlockCollectionId(block, recordMap)
    const collection = recordMap.collection?.[collectionId]?.value
    const collectionQuery = collectionId
      ? { [collectionId]: recordMap.collection_query?.[collectionId] }
      : recordMap.collection_query

    if (collection?.schema && Object.values(collectionQuery || {})[0]) {
      return {
        blockId: block.id,
        collection,
        collectionQuery,
        schema: collection.schema
      }
    }
  }

  return null
}

function isDatabaseBlock (block) {
  return (
    block?.type === 'collection_view_page' ||
    block?.type === 'collection_view'
  )
}
