export function getPostListDate (post, sortBy = 'updatedAt') {
  const updatedAt = sortBy === 'updatedAt' ? parseTimestamp(post?.updatedAt) : null
  return {
    timestamp: updatedAt ?? parseTimestamp(post?.date),
    updated: updatedAt !== null
  }
}

export function sortPosts (posts, sortBy = 'updatedAt') {
  const sorted = [...posts]
  if (sortBy === 'none') return sorted

  return sorted.sort((left, right) => {
    const order = compareTimestamps(
      getPostListDate(left, sortBy).timestamp,
      getPostListDate(right, sortBy).timestamp
    ) || compareTimestamps(parseTimestamp(left?.date), parseTimestamp(right?.date))
    if (order) return order

    // Keep pagination stable when multiple articles share the same timestamps.
    const leftKey = String(left?.slug || left?.id || '')
    const rightKey = String(right?.slug || right?.id || '')
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
}

export function getPostSortLabel (sortBy = 'updatedAt') {
  if (sortBy === 'updatedAt') return '按更新时间倒序编目'
  if (sortBy === 'date') return '按发布时间倒序编目'
  return '按自定义顺序编目'
}

function parseTimestamp (value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function compareTimestamps (left, right) {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}
