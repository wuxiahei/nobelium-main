import Image from 'next/image'
import { useConfig } from '@/lib/config'
import { ExternalLink, Mail } from 'lucide-react'

export default function AboutResume ({ post, emailHash }) {
  const BLOG = useConfig()

  return (
    <section className="about-resume mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="about-intro relative overflow-hidden p-6 sm:p-8">
        <div className="about-ink-mark" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          {BLOG.email
            ? (
              <Image
                alt={BLOG.author}
                width={112}
                height={112}
                src={`https://gravatar.com/avatar/${emailHash}?s=224`}
                className="about-avatar h-24 w-24 object-cover sm:h-28 sm:w-28"
              />
              )
            : (
              <div className="about-avatar about-monogram flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28" aria-label={BLOG.author}>
                {BLOG.author?.slice(0, 1) || 'E'}
              </div>
              )}
          <div className="min-w-0">
            <p className="ink-eyebrow mb-3">
              作者简介
            </p>
            <h1 className="text-3xl font-semibold text-[var(--ink-main)] sm:text-4xl">
              {BLOG.author}
            </h1>
            {post.summary && (
              <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--ink-muted)]">
                {post.summary}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              {BLOG.email && (
                <a
                  href={`mailto:${BLOG.email}`}
                  className="ink-command ink-command-primary"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  联系作者
                </a>
              )}
              {BLOG.socialLink && (
                <a
                  href={BLOG.socialLink}
                  rel="noreferrer"
                  target="_blank"
                  className="ink-command"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  社交主页
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
