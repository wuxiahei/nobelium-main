import { useLocale } from '@/lib/locale'
import Container from '@/components/Container'
import Link from 'next/link'
import { Home, Search } from 'lucide-react'

export default function Page404 () {
  const locale = useLocale()

  return (
    <Container>
      <section className="mx-auto max-w-xl border-y border-[var(--ink-line)] py-14 text-center">
        <p className="ink-eyebrow">页面未找到</p>
        <h1 className="mt-3 font-serif text-6xl font-semibold tracking-normal text-[var(--ink-main)]">404</h1>
        <p className="mt-4 text-lg text-[var(--ink-muted)]">{locale.PAGE.ERROR_404.MESSAGE}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="ink-command ink-command-primary">
            <Home className="h-4 w-4" aria-hidden="true" />
            返回首页
          </Link>
          <Link href="/search" className="ink-command">
            <Search className="h-4 w-4" aria-hidden="true" />
            搜索文章
          </Link>
        </div>
      </section>
    </Container>
  )
}
