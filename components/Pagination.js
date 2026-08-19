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
      className={`mt-12 flex border-t border-[var(--ink-line)] pt-8 text-sm font-medium text-[var(--ink-muted)] ${additionalClassName}`}
    >
      {currentPage !== 1 && (
        <Link
          href={
            currentPage - 1 === 1
              ? `${BLOG.path || '/'}`
              : `/page/${currentPage - 1}`
          }
          rel="prev"
          className="inline-flex items-center gap-3 rounded-sm px-3 py-2 transition-colors hover:bg-[var(--ink-accent-soft)] hover:text-[var(--ink-main)] ink-focus"
        >
          <span aria-hidden="true">&larr;</span>
          {locale.PAGINATION.PREV}
        </Link>
      )}
      {showNext && (
        <Link
          href={`/page/${currentPage + 1}`}
          rel="next"
          className="inline-flex items-center gap-3 rounded-sm px-3 py-2 transition-colors hover:bg-[var(--ink-accent-soft)] hover:text-[var(--ink-main)] ink-focus"
        >
          {locale.PAGINATION.NEXT}
          <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
    </div>
  )
}

export default Pagination
