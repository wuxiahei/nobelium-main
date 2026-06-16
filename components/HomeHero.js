import { useConfig } from '@/lib/config'

export default function HomeHero ({ postCount }) {
  const BLOG = useConfig()

  return (
    <section className="home-hero exhibition-hero mb-12 pt-4">
      <div className="max-w-3xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-stone-500 dark:text-stone-400">
          Selected Writings
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white sm:text-5xl md:text-6xl">
          {BLOG.title}
        </h1>
        {BLOG.description && (
          <p className="mt-5 max-w-2xl text-[1.04rem] leading-8 text-stone-600 dark:text-stone-300 md:text-lg">
            {BLOG.description}
          </p>
        )}
      </div>
      <div className="mt-8 grid gap-2 text-sm text-stone-500 dark:text-stone-400 md:grid-cols-[160px_minmax(0,1fr)]">
        <span className="uppercase tracking-[0.18em]">Current archive</span>
        <span>{postCount} texts, notes, and experiments</span>
      </div>
    </section>
  )
}
