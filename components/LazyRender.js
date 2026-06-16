import { useEffect, useRef, useState } from 'react'

export default function LazyRender ({ children, minHeight = 0, rootMargin = '300px 0px', placeholder = null }) {
  const containerRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node || visible) return

    const observer = new window.IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [rootMargin, visible])

  return (
    <div ref={containerRef} style={visible ? undefined : { minHeight }}>
      {visible ? children : placeholder}
    </div>
  )
}
