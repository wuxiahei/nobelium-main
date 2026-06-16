import { useConfig } from '@/lib/config'

export default function HomeHero ({ postCount }) {
  const BLOG = useConfig()

  return (
    <section className="home-hero mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-white/65 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/55 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
      <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex rounded-full border border-teal-200/70 bg-teal-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-teal-800 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100">
            Ely's blog
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-5xl">
            {BLOG.title}
          </h1>
          {BLOG.description && (
            <p className="mt-4 max-w-xl text-base leading-8 text-gray-600 dark:text-gray-300 sm:text-lg">
              {BLOG.description}
            </p>
          )}
        </div>
        <div className="hero-signature" aria-hidden="true">
          <span>Ely</span>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="rounded-full bg-white/70 px-3 py-1.5 ring-1 ring-gray-200/80 dark:bg-white/5 dark:ring-white/10">
          {postCount} posts
        </span>
        <span className="rounded-full bg-white/70 px-3 py-1.5 ring-1 ring-gray-200/80 dark:bg-white/5 dark:ring-white/10">
          Notes, ideas, and experiments
        </span>
      </div>
    </section>
  )
}
