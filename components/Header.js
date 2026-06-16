import { forwardRef, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useConfig } from '@/lib/config'
import { useLocale } from '@/lib/locale'

const NavBar = () => {
  const BLOG = useConfig()
  const locale = useLocale()
  const router = useRouter()
  const links = [
    { id: 0, name: locale.NAV.INDEX, to: BLOG.path || '/', show: true },
    { id: 1, name: locale.NAV.ABOUT, to: '/about', show: BLOG.showAbout },
    { id: 3, name: locale.NAV.SEARCH, to: '/search', show: true }
  ]
  const currentPath = router.asPath.split('?')[0].split('#')[0]

  return (
    <div className="flex-shrink-0">
      <ul className="flex flex-row items-center gap-1 sm:gap-2">
        {links.map(
          link => {
            const active = !link.external && (
              currentPath === link.to ||
              (link.to === '/search' && router.pathname === '/tag/[tag]')
            )

            return (
              link.show && (
                <li key={link.id} className="block nav">
                  <Link
                    href={link.to}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noreferrer' : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-md px-2.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 ${
                      active
                        ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                        : 'text-gray-600 hover:bg-stone-100 hover:text-black dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {link.name}
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
        <svg
          viewBox="0 0 24 24"
          className="caret w-6 h-6 absolute inset-x-0 bottom-0 mx-auto pointer-events-none opacity-30 group-hover:opacity-100 transition duration-100"
        >
          <path
            d="M12 10.828l-4.95 4.95-1.414-1.414L12 8l6.364 6.364-1.414 1.414z"
            className="fill-black dark:fill-white"
          />
        </svg>
        <div className="flex min-w-0 items-center">
          <Link
            href={BLOG.path || '/'}
            aria-label={BLOG.title}
            className="ely-brand transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-500"
          >
            <span className="ely-brand-mark" aria-hidden="true">
              <span className="ely-brand-kicker">Selected Writings</span>
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
      className="header-name ml-3 min-w-0 font-medium text-gray-700 dark:text-gray-200 capture-pointer-events grid-rows-1 grid-cols-1 items-center"
      onClick={onClick}
    >
      {postTitle && <span className="post-title row-start-1 col-start-1 truncate">{postTitle}</span>}
      <span className="row-start-1 col-start-1 truncate">
        <span className="site-title">{siteTitle}</span>
        <span className="site-description font-normal text-gray-500 dark:text-gray-400">, {siteDescription}</span>
      </span>
    </p>
  )
})
