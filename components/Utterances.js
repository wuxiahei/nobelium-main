import { useConfig } from '@/lib/config'
import { useEffect } from 'react'
const Utterances = ({ issueTerm, layout }) => {
  const BLOG = useConfig()
  const repo = BLOG?.comment?.utterancesConfig?.repo

  useEffect(() => {
    const theme =
      BLOG.appearance === 'auto'
        ? 'preferred-color-scheme'
        : BLOG.appearance === 'light'
          ? 'github-light'
          : 'github-dark'
    const anchor = document.getElementById('comments')
    if (!repo || !issueTerm || !anchor) return undefined

    anchor.replaceChildren()
    const script = document.createElement('script')
    script.setAttribute('src', 'https://utteranc.es/client.js')
    script.setAttribute('crossorigin', 'anonymous')
    script.setAttribute('async', true)
    script.setAttribute('repo', repo)
    script.setAttribute('issue-term', issueTerm)
    script.setAttribute('theme', theme)
    anchor.appendChild(script)
    return () => {
      anchor.replaceChildren()
    }
  }, [BLOG.appearance, issueTerm, repo])
  return (
    <>
      <div
        id="comments"
        className={layout && layout === 'fullWidth' ? '' : 'md:-ml-16'}
      >
        <div className="utterances-frame"></div>
      </div>
    </>
  )
}

export default Utterances
