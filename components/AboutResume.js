import Image from 'next/image'
import { useConfig } from '@/lib/config'

export default function AboutResume ({ post, emailHash }) {
  const BLOG = useConfig()

  return (
    <section className="about-resume mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="relative overflow-hidden border border-stone-200 bg-[#fbfaf5] p-6 shadow-[0_20px_70px_rgba(28,25,23,0.06)] dark:border-stone-800 dark:bg-[#171412] dark:shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="about-resume-orb" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          <Image
            alt={BLOG.author}
            width={112}
            height={112}
            src={`https://gravatar.com/avatar/${emailHash}?s=224`}
            className="h-24 w-24 rounded-sm object-cover ring-1 ring-stone-200 dark:ring-stone-700 sm:h-28 sm:w-28"
          />
          <div className="min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-stone-500 dark:text-stone-400">
              Author Page
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-gray-950 dark:text-white sm:text-4xl">
              {post.title}
            </h1>
            {post.summary && (
              <p className="mt-4 max-w-2xl text-base leading-8 text-stone-600 dark:text-stone-300">
                {post.summary}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              {BLOG.email && (
                <a
                  href={`mailto:${BLOG.email}`}
                  className="rounded-full bg-gray-950 px-4 py-2 text-white transition hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  Contact
                </a>
              )}
              {BLOG.socialLink && (
                <a
                  href={BLOG.socialLink}
                  rel="noreferrer"
                  target="_blank"
                  className="rounded-full bg-transparent px-4 py-2 text-stone-700 ring-1 ring-stone-200 transition hover:text-gray-950 hover:ring-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:text-stone-300 dark:ring-stone-700 dark:hover:text-white dark:hover:ring-stone-500"
                >
                  Social
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
