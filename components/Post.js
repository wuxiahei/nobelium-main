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
      <article className="flex flex-col pb-2">
        <AboutResume post={post} emailHash={emailHash} />
        <div className="resume-content mt-8 w-full self-center px-4 sm:px-6 md:max-w-3xl">
          <NotionRenderer recordMap={blockMap} fullPage={false} darkMode={dark} />
        </div>
      </article>
    )
  }

  return (
    <article className={cn('flex flex-col pb-2', fullWidth ? 'md:px-24' : 'items-center')}>
      <h1 className={cn(
        'w-full text-3xl font-bold leading-tight text-gray-950 dark:text-white md:text-4xl',
        { 'max-w-3xl px-4 sm:px-6': !fullWidth }
      )}>
        {post.title}
      </h1>
      {post.type[0] !== 'Page' && (
        <nav className={cn(
          'mt-5 flex w-full flex-wrap items-center gap-x-2 gap-y-3 text-sm text-gray-500 dark:text-gray-400',
          { 'max-w-3xl px-4 sm:px-6': !fullWidth }
        )}>
          <div className="flex items-center">
            <a
              href={BLOG.socialLink || '#'}
              className="inline-flex items-center rounded-md transition-colors hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:text-gray-100"
            >
              <Image
                alt={BLOG.author}
                width={28}
                height={28}
                src={`https://gravatar.com/avatar/${emailHash}`}
                className="rounded-full ring-1 ring-gray-200 dark:ring-gray-700"
              />
              <p className="ml-2 md:block">{BLOG.author}</p>
            </a>
            <span className="ml-2 text-gray-300 dark:text-gray-700">/</span>
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
      <div className="mt-6 flex self-stretch flex-col items-center lg:flex-row lg:items-start">
        {!fullWidth && <div className="flex-1 hidden lg:block" />}
        <div className={fullWidth ? 'flex-1 pr-4' : 'w-full max-w-3xl flex-none px-4 sm:px-6'}>
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
