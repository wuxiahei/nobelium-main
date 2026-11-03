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

      <div className="home-hero-masthead">
        <span>Nobelium / Field Notes</span>
        <span>独立写作 · 持续编目</span>
      </div>

      <div className="home-hero-grid">
        <div className="home-hero-copy">
          <p className="home-hero-kicker">
            <span>Editor&apos;s note</span>
            <span>札记、长文与工作方法</span>
          </p>
          <h1 id="home-hero-title">在纸墨之间，整理持续生长的思考。</h1>
          <p className="home-hero-description">
            {BLOG.description || '记录技术、设计与持续思考的个人知识札记。'}
          </p>
          <div className="home-hero-actions">
            <Link href="/search" className="ink-command ink-command-primary">
              <BookOpenText className="h-4 w-4" aria-hidden="true" />
              浏览全部文章
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

        <aside className="home-hero-ledger" aria-label="刊物档案">
          <p className="home-hero-ledger-label">当前档案</p>
          <div className="home-hero-ledger-count">
            <strong>{String(postCount).padStart(2, '0')}</strong>
            <span>篇在册文章</span>
          </div>
          <dl>
            <div>
              <dt>内容来源</dt>
              <dd>Notion / GitHub</dd>
            </div>
            <div>
              <dt>更新方式</dt>
              <dd>持续增补</dd>
            </div>
            <div>
              <dt>阅读入口</dt>
              <dd>索引与标签</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="home-hero-footer" aria-hidden="true">
        <span>01 — 阅读与思考</span>
        <span>独立出版 / Personal edition</span>
        <span>持续更新中</span>
      </div>
    </section>
  )
}