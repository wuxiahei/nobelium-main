import { config as BLOG } from '@/lib/server/config'

import { idToUuid } from 'notion-utils'
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

  const collection = Object.values(response.collection || {})[0]?.value
  const collectionQuery = response.collection_query
  const block = response.block
  const schema = collection?.schema

  const rawMetadata = block?.[id]?.value

  // Check Type
  if (
    rawMetadata?.type !== 'collection_view_page' &&
    rawMetadata?.type !== 'collection_view'
  ) {
    console.warn(`pageId "${id}" is not a database`)
    return []
  } else {
    if (!collectionQuery || !block || !schema) {
      console.warn(`pageId "${id}" does not contain a readable database schema`)
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
}
