import Container from '@/components/Container'
import BlogPost from '@/components/BlogPost'
import Pagination from '@/components/Pagination'
import { getAllPosts } from '@/lib/notion'
import { config } from '@/lib/server/config'

const Page = ({ postsToShow, page, showNext }) => {
  return (
    <Container headerMeta={`文章档案 · 第 ${page} 页`}>
      <section className="article-index" aria-labelledby="archive-page-title">
        <header className="article-index-header">
          <div>
            <p className="ink-eyebrow">Archive / Page {String(page).padStart(2, '0')}</p>
            <h2 id="archive-page-title">往期札记</h2>
          </div>
          <p>按发布时间倒序编目</p>
        </header>
        {postsToShow && postsToShow.map(post => <BlogPost key={post.id} post={post} />)}
      </section>
      <Pagination page={page} showNext={showNext} />
    </Container>
  )
}

export async function getStaticProps (context) {
  const { page } = context.params
  const posts = (await getAllPosts({ includePages: false })).filter(isHomePost)
  const postsToShow = posts.slice(
    config.postsPerPage * (page - 1),
    config.postsPerPage * page
  )
  const totalPosts = posts.length
  const showNext = page * config.postsPerPage < totalPosts
  return {
    props: {
      page,
      postsToShow,
      showNext
    },
    revalidate: 300
  }
}

export async function getStaticPaths () {
  const posts = (await getAllPosts({ includePages: false })).filter(isHomePost)
  const totalPosts = posts.length
  const totalPages = Math.ceil(totalPosts / config.postsPerPage)
  return {
    paths: Array.from({ length: totalPages - 1 }, (_, i) => ({
      params: { page: '' + (i + 2) }
    })),
    fallback: 'blocking'
  }
}

function isHomePost (post) {
  return post?.slug !== 'about'
}

export default Page