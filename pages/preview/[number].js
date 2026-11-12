import { createHash } from 'crypto'
import Link from 'next/link'
import Container from '@/components/Container'
import Post from '@/components/Post'
import { getAdminSession } from '@/lib/server/admin-auth.mjs'
import { getAdminGitHubPost } from '@/lib/server/github-posts.mjs'
import { clientConfig } from '@/lib/server/config'

export default function DraftPreview ({ post, content, emailHash }) {
  return (
    <Container
      layout="blog"
      title={'草稿预览 · ' + post.title}
      description={post.summary}
      type="article"
      headerMeta="管理员预览"
      robots="noindex, nofollow"
    >
      <div className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        <span className="rounded-sm border border-[var(--ink-seal)] bg-[var(--ink-seal-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-seal)]">
          草稿预览 · 仅管理员可见
        </span>
        <Link href="/admin" className="ink-command">
          返回写作后台
        </Link>
      </div>

      <Post
        post={post}
        blockMap={null}
        markdown={content}
        emailHash={emailHash}
        fullWidth={false}
      />
    </Container>
  )
}

export async function getServerSideProps (context) {
  const session = getAdminSession(context.req)
  if (!session) {
    return {
      redirect: {
        destination: '/admin',
        permanent: false
      }
    }
  }

  const rawNumber = Array.isArray(context.params?.number)
    ? context.params.number[0]
    : context.params?.number

  try {
    const result = await getAdminGitHubPost(rawNumber)
    context.res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    context.res.setHeader('X-Robots-Tag', 'noindex, nofollow')

    const emailHash = createHash('md5')
      .update(String(clientConfig.email || ''))
      .digest('hex')
      .trim()
      .toLowerCase()

    return {
      props: {
        post: result.post,
        content: result.content || '',
        emailHash
      }
    }
  } catch (error) {
    if (error?.status === 404) return { notFound: true }
    throw error
  }
}