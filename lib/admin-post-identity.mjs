export function getAdminPostKey (post) {
  return post?.source === 'notion' ? 'notion-' + (post.notionPageId || post.id) : post?.githubIssueNumber ?? null
}

export function getAdminPostUrl (key) {
  return String(key).startsWith('notion-')
    ? '/api/admin/posts/notion/' + encodeURIComponent(String(key).slice(7))
    : '/api/admin/posts/' + encodeURIComponent(key)
}
