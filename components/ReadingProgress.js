import { useEffect, useState } from 'react'

export default function ReadingProgress () {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function updateProgress () {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollHeight > 0 ? Math.min(100, (scrollTop / scrollHeight) * 100) : 0)
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)

    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [])

  return (
    <div className="fixed left-0 top-0 z-50 h-0.5 w-full bg-transparent" aria-hidden="true">
      <div
        className="h-full bg-[var(--ink-seal)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
