import { forwardRef, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'
import { Bot, ChevronUp, House, Search, UserRound } from 'lucide-react'

const NavBar = () => {
  const BLOG = useConfig()
  const locale = useLocale()
  const router = useRouter()
  const links = [
    { id: 0, name: locale.NAV.INDEX, to: BLOG.path || '/', show: true, icon: House },
    { id: 1, name: locale.NAV.ABOUT, to: '/about', show: BLOG.showAbout, icon: UserRound },
    { id: 2, name: locale.NAV.AI || 'AI 工作间', to: '/ai', show: BLOG.showAI !== false, icon: Bot },
    { id: 3, name: locale.NAV.SEARCH, to: '/search', show: true, icon: Search }
  ]
  const currentPath = router.asPath.split('?')[0].split('#')[0]

  return (
    <div className="flex-shrink-0">
      <ul className="flex flex-row items-center gap-1" aria-label="主要导航">
        {links.map(
          link => {
            const active = !link.external && (
              currentPath === link.to ||
              (link.to === '/search' && router.pathname === '/tag/[tag]')
            )

            const Icon = link.icon

            return (
              link.show && (
                <li key={link.id} className="block nav">
                  <Link
                    href={link.to}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noreferrer' : undefined}
                    aria-current={active ? 'page' : undefined}
                    aria-label={link.name}
                    title={link.name}
                    className={`ink-nav-link inline-flex h-10 items-center justify-center gap-2 px-2.5 text-sm font-medium transition sm:h-9 ${
                      active
                        ? 'ink-nav-link-active'
                        : ''
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                    <span className="hidden md:inline">{link.name}</span>
                  </Link>
                </li>
              )
            )
          }
        )}
      </ul>
    </div>
  )
}

export default function Header ({ navBarTitle, headerMeta, fullWidth }) {
  const BLOG = useConfig()

  const useSticky = !BLOG.autoCollapsedNavBar
  const navRef = useRef(/** @type {HTMLDivElement} */ undefined)
  const sentinelRef = useRef(/** @type {HTMLDivElement} */ undefined)
  const handler = useCallback(([entry]) => {
    if (useSticky && navRef.current) {
      navRef.current?.classList.toggle('sticky-nav-full', !entry.isIntersecting)
    } else {
      navRef.current?.classList.add('remove-sticky')
    }
  }, [useSticky])

  useEffect(() => {
    const sentinelEl = sentinelRef.current
    const observer = new window.IntersectionObserver(handler)
    observer.observe(sentinelEl)

    return () => {
      sentinelEl && observer.unobserve(sentinelEl)
    }
  }, [handler, sentinelRef])

  const titleRef = useRef(/** @type {HTMLParagraphElement} */ undefined)

  function handleClickHeader (/** @type {MouseEvent} */ ev) {
    if (![navRef.current, titleRef.current].includes(ev.target)) return

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  return (
    <>
      <div className="observer-element h-4 md:h-12" ref={sentinelRef}></div>
      <div
        className={`sticky-nav group m-auto mb-4 flex h-16 w-full flex-row items-center justify-between bg-day/75 py-4 dark:bg-night/75 md:mb-12 ${
          !fullWidth ? 'max-w-3xl px-4 sm:px-6' : 'px-4 md:px-24'
        }`}
        id="sticky-nav"
        ref={navRef}
        onClick={handleClickHeader}
      >
        <ChevronUp className="caret pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-4 w-4 opacity-30 transition duration-100 group-hover:opacity-100" aria-hidden="true" />
        <div className="flex min-w-0 items-center">
          <Link
            href={BLOG.path || '/'}
            aria-label={BLOG.title}
            className="ely-brand ink-focus transition hover:opacity-90"
          >
            <span className="ely-brand-mark" aria-hidden="true">
              <span className="ely-brand-kicker">墨间札记</span>
              <span className="ely-brand-name">Ely</span>
              {headerMeta && <span className="ely-brand-meta">{headerMeta}</span>}
            </span>
          </Link>
          {navBarTitle && (
            <HeaderName
              ref={titleRef}
              siteTitle={BLOG.title}
              siteDescription={BLOG.description}
              postTitle={navBarTitle}
              onClick={handleClickHeader}
            />
          )}
        </div>
        <NavBar />
      </div>
    </>
  )
}

const HeaderName = forwardRef(function HeaderName ({ siteTitle, siteDescription, postTitle, onClick }, ref) {
  return (
    <p
      ref={ref}
      className="header-name ml-3 min-w-0 font-medium text-[var(--ink-main)] capture-pointer-events grid-rows-1 grid-cols-1 items-center"
      onClick={onClick}
    >
      {postTitle && <span className="post-title row-start-1 col-start-1 truncate">{postTitle}</span>}
      <span className="row-start-1 col-start-1 truncate">
        <span className="site-title">{siteTitle}</span>
        <span className="site-description font-normal text-[var(--ink-muted)]">, {siteDescription}</span>
      </span>
    </p>
  )
})
