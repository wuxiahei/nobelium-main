import Link from 'next/link'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'

const Pagination = ({ page, showNext }) => {
  const BLOG = useConfig()
  const locale = useLocale()
  const currentPage = +page
  let additionalClassName = 'justify-between'
  if (currentPage === 1 && showNext) additionalClassName = 'justify-end'
  if (currentPage !== 1 && !showNext) additionalClassName = 'justify-start'

  return (
    <div
      className={`mt-12 flex border-t border-stone-200 pt-8 text-sm font-medium text-stone-700 dark:border-stone-800 dark:text-stone-300 ${additionalClassName}`}
    >
      {currentPage !== 1 && (
        <Link
          href={
            currentPage - 1 === 1
              ? `${BLOG.path || '/'}`
              : `/page/${currentPage - 1}`
          }
          rel="prev"
          className="inline-flex items-center gap-3 rounded-md px-3 py-2 transition-transform duration-200 hover:-translate-x-1 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:hover:text-gray-50"
        >
          <span aria-hidden="true">&larr;</span>
          {locale.PAGINATION.PREV}
        </Link>
      )}
      {showNext && (
        <Link
          href={`/page/${currentPage + 1}`}
          rel="next"
          className="inline-flex items-center gap-3 rounded-md px-3 py-2 transition-transform duration-200 hover:translate-x-1 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:hover:text-gray-50"
        >
          {locale.PAGINATION.NEXT}
          <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
    </div>
  )
}

export default Pagination
