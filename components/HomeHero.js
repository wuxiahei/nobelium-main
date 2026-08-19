import { useConfig } from '@/lib/config'
import Link from 'next/link'
import { ArrowRight, BookOpenText, Sparkles } from 'lucide-react'

export default function HomeHero ({ postCount }) {
  const BLOG = useConfig()

  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-ink-art" aria-hidden="true">
        <span className="home-ink-wash" />
        <span className="home-ink-stroke" />
        <span className="home-ink-seal">E</span>
      </div>
      <div className="home-hero-copy">
        <p className="ink-eyebrow">Ely · 墨间札记</p>
        <h1 id="home-hero-title">在纸墨之间，整理持续生长的思考。</h1>
        <p className="home-hero-description">
          {BLOG.description || '记录技术、设计与持续思考的个人知识札记。'}
        </p>
        <div className="home-hero-actions">
          <Link href="/search" className="ink-command ink-command-primary">
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            浏览 {postCount} 篇文章
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {BLOG.showAI !== false && (
            <Link href="/ai" className="ink-command">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              进入 AI 工作间
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
