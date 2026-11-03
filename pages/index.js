import { clientConfig } from '@/lib/server/config'

import Container from '@/components/Container'
import BlogPost from '@/components/BlogPost'
import Pagination from '@/components/Pagination'
import HomeHero from '@/components/HomeHero'
import { getAllPosts } from '@/lib/notion'
import { useConfig } from '@/lib/config'

export async function getStaticProps () {
  const posts = (await getAllPosts({ includePages: false })).filter(isHomePost)
  const postsToShow = posts.slice(0, clientConfig.postsPerPage)
  const totalPosts = posts.length
  const showNext = totalPosts > clientConfig.postsPerPage
  return {
    props: {
      page: 1,
      postsToShow,
      totalPosts,
      showNext
    },
    revalidate: 300
  }
}

function isHomePost (post) {
  return post?.slug !== 'about'
}

export default function Blog ({ postsToShow, totalPosts, page, showNext }) {
  const { title, description } = useConfig()

  return (
    <Container
      title={title}
      description={description}
      headerMeta={`${totalPosts} 篇文章与札记`}
    >
      <HomeHero postCount={totalPosts} />
      <section className="article-index" aria-labelledby="latest-entries-title">
        <header className="article-index-header">
          <div>
            <p className="ink-eyebrow">Latest entries</p>
            <h2 id="latest-entries-title">近期札记</h2>
          </div>
          <p>按发布时间编目 · 共 {totalPosts} 篇</p>
        </header>
        {postsToShow.map(post => (
          <BlogPost key={post.id} post={post} />
        ))}
      </section>
      {showNext && <Pagination page={page} showNext={showNext} />}
    </Container>
  )
}