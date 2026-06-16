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
        className="mb-4 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_24px_80px_rgba(20,184,166,0.12)] dark:border-white/10 dark:bg-zinc-950/55 dark:shadow-[0_18px_60px_rgba(0,0,0,0.2)] dark:hover:border-teal-300/30 md:p-6"
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
        {post.tags && post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-100 dark:bg-teal-300/10 dark:text-teal-100 dark:ring-teal-300/15"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </Link>
  )
}

export default BlogPost
