import Image from 'next/image'
import { useConfig } from '@/lib/config'

export default function AboutResume ({ post, emailHash }) {
  const BLOG = useConfig()

  return (
    <section className="about-resume mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/60 dark:shadow-[0_24px_90px_rgba(0,0,0,0.3)] sm:p-8">
        <div className="about-resume-orb" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          <Image
            alt={BLOG.author}
            width={112}
            height={112}
            src={`https://gravatar.com/avatar/${emailHash}?s=224`}
            className="h-24 w-24 rounded-3xl object-cover ring-1 ring-gray-200 dark:ring-white/10 sm:h-28 sm:w-28"
          />
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.26em] text-teal-700 dark:text-teal-200">
              About Ely
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">
              {post.title}
            </h1>
            {post.summary && (
              <p className="mt-3 max-w-2xl text-base leading-8 text-gray-600 dark:text-gray-300">
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
                  className="rounded-full bg-white/80 px-4 py-2 text-gray-700 ring-1 ring-gray-200 transition hover:text-gray-950 hover:ring-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20"
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
