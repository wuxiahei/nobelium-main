import 'gitalk/dist/gitalk.css'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import cn from 'classnames'
import { fetchCusdisLang } from '@/lib/cusdisLang'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'
import LazyRender from '@/components/LazyRender'

const GitalkComponent = dynamic(
  () => {
    return import('gitalk/dist/gitalk-component')
  },
  { ssr: false }
)
const UtterancesComponent = dynamic(
  () => {
    return import('@/components/Utterances')
  },
  { ssr: false }
)
const CusdisComponent = dynamic(
  () => {
    return import('react-cusdis').then(m => m.ReactCusdis)
  },
  { ssr: false }
)

const Comments = ({ frontMatter }) => {
  const router = useRouter()
  const BLOG = useConfig()
  const locale = useLocale()

  const provider = BLOG?.comment?.provider
  const cusdisAppId = BLOG?.comment?.cusdisConfig?.appId?.trim()
  const isCusdis = provider === 'cusdis'
  const cusdisConfigured = isCusdis && Boolean(cusdisAppId)
  const fullWidth = frontMatter.fullWidth ?? false

  if (!provider) return null

  return (
    <div
      className={cn(
        'my-5 px-4 font-medium text-gray-500 dark:text-gray-400',
        fullWidth ? 'md:px-24' : 'mx-auto max-w-3xl sm:px-6',
      )}
    >
      <h2 className={cn('text-lg font-semibold text-[var(--ink-main)]', cusdisConfigured ? 'mb-2' : 'mb-4')}>
        {locale.POST.COMMENTS}
      </h2>
      {cusdisConfigured && (
        <p className="mb-4 text-sm font-normal leading-6 text-[var(--ink-muted)]">
          {locale.POST.COMMENTS_GUEST_HINT}
        </p>
      )}
      <LazyRender
        minHeight={160}
        placeholder={<div className="rounded-xl border border-gray-200/80 bg-white/50 px-4 py-6 text-sm dark:border-gray-800 dark:bg-white/5">{locale.POST.COMMENTS_LOADING}</div>}
      >
        <>
          {BLOG.comment && BLOG.comment.provider === 'gitalk' && (
            <GitalkComponent
              options={{
                id: frontMatter.id,
                title: frontMatter.title,
                clientID: BLOG.comment.gitalkConfig.clientID,
                clientSecret: BLOG.comment.gitalkConfig.clientSecret,
                repo: BLOG.comment.gitalkConfig.repo,
                owner: BLOG.comment.gitalkConfig.owner,
                admin: BLOG.comment.gitalkConfig.admin,
                distractionFreeMode: BLOG.comment.gitalkConfig.distractionFreeMode
              }}
            />
          )}
          {BLOG.comment && BLOG.comment.provider === 'utterances' && (
            <UtterancesComponent issueTerm={frontMatter.id} />
          )}
          {isCusdis && (
            cusdisAppId ? (
              <CusdisComponent
                lang={fetchCusdisLang(BLOG.lang)}
                attrs={{
                  host: BLOG.comment.cusdisConfig.host,
                  appId: cusdisAppId,
                  pageId: frontMatter.id,
                  pageTitle: frontMatter.title,
                  pageUrl: BLOG.link + router.asPath,
                  theme: BLOG.appearance
                }}
              />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-normal leading-6 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200" role="status">
                {locale.POST.COMMENTS_UNAVAILABLE}
              </div>
            )
          )}
        </>
      </LazyRender>
    </div>
  )
}

export default Comments
