import Link from 'next/link'

const TagItem = ({ tag }) => (
  <Link
    href={`/tag/${encodeURIComponent(tag)}`}
    className="mr-1 inline-flex rounded-md border border-gray-200 px-2 py-1 text-sm leading-none text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-900 dark:hover:text-gray-100"
  >
    {tag}
  </Link>
)

export default TagItem
