import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { parseReadingPosition, readingMetrics } from '@/lib/reading-position.mjs'

export default function ReadingProgress ({ articleId, bodyRef }) {
  const [progress, setProgress] = useState(0)
  const [resume, setResume] = useState(null)
  const interacted = useRef(false)
  const storageKey = 'nobelium-reading:' + articleId

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let frame = 0
    let timer = 0
    let latest = null
    interacted.current = false
    try {
      if (!window.location.hash) setResume(parseReadingPosition(localStorage.getItem(storageKey)))
    } catch { /* Reading does not require local storage. */ }

    function update () {
      const metrics = measure(body)
      setProgress(metrics.progress * 100)
      const headings = [...body.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')]
      const anchor = headings.filter(node => node.getBoundingClientRect().top <= articleOffset(body) + 30).pop()
      latest = {
        v: 1, progress: metrics.progress, updatedAt: Date.now(),
        anchor: anchor?.id || '', anchorOffset: anchor?.getBoundingClientRect().top || 0
      }
    }
    function persist () {
      if (!interacted.current || !latest) return
      try {
        if (latest.progress >= 0.03 && latest.progress < 0.98) localStorage.setItem(storageKey, JSON.stringify(latest))
        else localStorage.removeItem(storageKey)
      } catch { /* Storage may be unavailable or full. */ }
    }
    function schedule () {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    function onScroll () {
      schedule()
      if (!interacted.current) return
      setResume(null)
      clearTimeout(timer)
      timer = window.setTimeout(persist, 400)
    }
    function onInteraction (event) {
      if (event.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return
      interacted.current = true
    }
    function flush () { update(); persist() }
    function onVisibility () { if (document.visibilityState === 'hidden') flush() }
    update()
    const observer = new ResizeObserver(schedule)
    observer.observe(body)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('wheel', onInteraction, { passive: true })
    window.addEventListener('touchstart', onInteraction, { passive: true })
    window.addEventListener('pointerdown', onInteraction, { passive: true })
    window.addEventListener('keydown', onInteraction)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      // Persist the last measured position; route teardown may already have removed the body.
      persist()
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('wheel', onInteraction)
      window.removeEventListener('touchstart', onInteraction)
      window.removeEventListener('pointerdown', onInteraction)
      window.removeEventListener('keydown', onInteraction)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [bodyRef, storageKey])

  function continueReading () {
    const body = bodyRef.current
    if (!body || !resume) return
    const metrics = measure(body)
    const anchor = resume.anchor ? document.getElementById(resume.anchor) : null
    const target = anchor && body.contains(anchor)
      ? window.scrollY + anchor.getBoundingClientRect().top - resume.anchorOffset
      : metrics.start + metrics.range * resume.progress
    interacted.current = true
    window.scrollTo({ top: Math.max(metrics.start, Math.min(metrics.start + metrics.range, target)), behavior: 'auto' })
    body.focus({ preventScroll: true })
    setResume(null)
  }

  return (
    <>
      <div className="reading-progress" aria-hidden="true"><div style={{ width: `${progress}%` }} /></div>
      {resume && (
        <aside className="reading-resume" aria-label="恢复阅读位置">
          <div><strong>上次读到 {Math.round(resume.progress * 100)}%</strong><span>阅读位置保存在当前浏览器</span></div>
          <button type="button" className="ink-command ink-command-primary" onClick={continueReading}>继续阅读</button>
          <button type="button" className="ink-command" aria-label="关闭阅读提示" onClick={() => setResume(null)}><X size={16} aria-hidden="true" /></button>
        </aside>
      )}
    </>
  )
}

function articleOffset (body) {
  return parseFloat(getComputedStyle(body).scrollMarginTop) || 100
}

function measure (body) {
  const rect = body.getBoundingClientRect()
  return readingMetrics({ top: window.scrollY + rect.top, height: rect.height, viewport: window.innerHeight, offset: articleOffset(body), scrollY: window.scrollY })
}
