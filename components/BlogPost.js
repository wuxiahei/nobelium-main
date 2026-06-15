import FormattedDate from '@/components/FormattedDate'
import { useConfig } from '@/lib/config'
import Link from 'next/link'

const BlogPost = ({ post }) => {
  const BLOG = useConfig()

  return (
    <Link
      href={`${BLOG.path}/${post.slug}`}
      className="group block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
    >
      <article
        key={post.id}
        className="border-b border-gray-200/80 py-6 transition-colors last:border-b-0 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700 md:py-7"
      >
        <header className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
          <h2 className="text-lg font-semibold leading-snug text-gray-950 transition-colors group-hover:text-blue-700 dark:text-gray-50 dark:group-hover:text-blue-300 md:text-xl">
            {post.title}
          </h2>
          <time className="flex-shrink-0 text-sm text-gray-500 dark:text-gray-500">
            <FormattedDate date={post.date} />
          </time>
        </header>
        {post.summary && (
          <p className="mt-3 line-clamp-2 leading-7 text-gray-600 dark:text-gray-400">
            {post.summary}
          </p>
        )}
      </article>
    </Link>
  )
}

export default BlogPost
