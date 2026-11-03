import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { X } from 'lucide-react'

export default function ImageLightbox ({ children }) {
  const rootRef = useRef(null)
  const closeButtonRef = useRef(null)
  const lastFocusedRef = useRef(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const makeImagesZoomable = () => {
      root.querySelectorAll('img').forEach(image => {
        image.dataset.zoomable = 'true'
        image.tabIndex = 0
        if (!image.getAttribute('role')) image.setAttribute('role', 'button')
        if (!image.getAttribute('aria-label')) {
          image.setAttribute('aria-label', image.alt ? `放大图片：${image.alt}` : '放大图片')
        }
      })
    }

    makeImagesZoomable()
    const observer = new MutationObserver(makeImagesZoomable)
    observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!preview) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      lastFocusedRef.current?.focus?.()
    }
  }, [preview])

  function handleClick (event) {
    const image = getImageFromEvent(event)
    if (image) openImage(image)
  }

  function handleKeyDown (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const image = getImageFromEvent(event)
    if (!image) return
    event.preventDefault()
    openImage(image)
  }

  function openImage (image) {
    const src = image.currentSrc || image.src
    if (!src) return
    const figure = image.closest('figure, .markdown-image')
    const captionNode = figure?.querySelector('figcaption, .markdown-image-caption')
    lastFocusedRef.current = image
    setPreview({
      src,
      alt: image.alt || '文章图片',
      caption: captionNode?.textContent?.trim() || image.alt || ''
    })
  }

  return (
    <div
      ref={rootRef}
      className="article-content"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
      {preview && createPortal(
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={event => {
            if (event.target === event.currentTarget) setPreview(null)
          }}
        >
          <button
            ref={closeButtonRef}
            type="button"
            className="image-lightbox-close"
            aria-label="关闭图片预览"
            onClick={() => setPreview(null)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <figure className="image-lightbox-figure">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.src} alt={preview.alt} />
            {preview.caption && <figcaption>{preview.caption}</figcaption>}
          </figure>
        </div>,
        document.body
      )}
    </div>
  )
}

function getImageFromEvent (event) {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('img')
}

ImageLightbox.propTypes = {
  children: PropTypes.node.isRequired
}