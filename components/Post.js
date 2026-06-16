import PropTypes from 'prop-types'
import Image from 'next/image'
import cn from 'classnames'
import { useConfig } from '@/lib/config'
import useTheme from '@/lib/theme'
import FormattedDate from '@/components/FormattedDate'
import TagItem from '@/components/TagItem'
import NotionRenderer from '@/components/NotionRenderer'
import TableOfContents from '@/components/TableOfContents'
import AboutResume from '@/components/AboutResume'

/**
 * A post renderer
 *
 * @param {PostProps} props
 *
 * @typedef {object} PostProps
 * @prop {object}   post       - Post metadata
 * @prop {object}   blockMap   - Post block data
 * @prop {string}   emailHash  - Author email hash (for Gravatar)
 * @prop {boolean} [fullWidth] - Whether in full-width mode
 */
export default function Post (props) {
  const BLOG = useConfig()
  const { post, blockMap, emailHash, fullWidth = false } = props
  const { dark } = useTheme()
  const isAboutPage = post.slug === 'about'

  if (isAboutPage) {
    return (
      <article className="book-page flex flex-col pb-2">
        <AboutResume post={post} emailHash={emailHash} />
        <div className="resume-content mt-10 w-full self-center px-4 sm:px-6 md:max-w-3xl">
          <NotionRenderer recordMap={blockMap} fullPage={false} darkMode={dark} />
        </div>
      </article>
    )
  }

  return (
    <article className={cn('book-page flex flex-col pb-2', fullWidth ? 'md:px-24' : 'items-center')}>
      <div className={cn('w-full', { 'max-w-3xl px-4 sm:px-6': !fullWidth })}>
        <p className="mb-4 text-xs uppercase tracking-[0.34em] text-stone-400 dark:text-stone-500">
          Chapter
        </p>
        <h1 className="w-full text-3xl font-semibold leading-tight tracking-[-0.03em] text-gray-950 dark:text-white md:text-[3rem]">
          {post.title}
        </h1>
      </div>
      {post.type[0] !== 'Page' && (
        <nav className={cn(
          'mt-6 flex w-full flex-wrap items-center gap-x-3 gap-y-3 text-sm text-stone-500 dark:text-stone-400',
          { 'max-w-3xl px-4 sm:px-6': !fullWidth }
        )}>
          <div className="flex items-center">
            <a
              href={BLOG.socialLink || '#'}
              className="inline-flex items-center rounded-md transition-colors hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:hover:text-gray-100"
            >
              <Image
                alt={BLOG.author}
                width={28}
                height={28}
                src={`https://gravatar.com/avatar/${emailHash}`}
                className="rounded-full ring-1 ring-stone-200 dark:ring-stone-700"
              />
              <p className="ml-2 md:block">{BLOG.author}</p>
            </a>
            <span className="ml-2 text-stone-300 dark:text-stone-700">/</span>
          </div>
          <div>
            <FormattedDate date={post.date} />
          </div>
          {post.tags && (
            <div className="article-tags flex max-w-full flex-wrap gap-y-1">
              {post.tags.map(tag => (
                <TagItem key={tag} tag={tag} />
              ))}
            </div>
          )}
        </nav>
      )}
      <div className="mt-10 flex self-stretch flex-col items-center lg:flex-row lg:items-start">
        {!fullWidth && <div className="flex-1 hidden lg:block" />}
        <div className={fullWidth ? 'flex-1 pr-4' : 'book-sheet w-full max-w-3xl flex-none px-5 py-8 sm:px-8'}>
          <NotionRenderer recordMap={blockMap} fullPage={false} darkMode={dark} />
        </div>
        <div className={cn('hidden w-full max-w-3xl lg:block lg:w-auto lg:max-w-[unset] lg:min-w-[180px]', fullWidth ? 'flex-none' : 'flex-1')}>
          {/* `65px` is the height of expanded nav */}
          {/* TODO: Remove the magic number */}
          <TableOfContents blockMap={blockMap} className="sticky pt-2" style={{ top: '76px' }} />
        </div>
      </div>
    </article>
  )
}

Post.propTypes = {
  post: PropTypes.object.isRequired,
  blockMap: PropTypes.object.isRequired,
  emailHash: PropTypes.string.isRequired,
  fullWidth: PropTypes.bool
}
