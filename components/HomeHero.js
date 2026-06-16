import { useConfig } from '@/lib/config'

export default function HomeHero ({ postCount }) {
  const BLOG = useConfig()

  if (!BLOG.description) return null

  return (
    <section className="home-hero mb-8 pt-4">
      <p className="max-w-2xl text-[1.02rem] leading-8 text-stone-600 dark:text-stone-300 md:text-lg">
        {BLOG.description}
      </p>
    </section>
  )
}
