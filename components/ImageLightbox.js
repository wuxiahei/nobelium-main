import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { X } from 'lucide-react'
import ContentImage from '@/components/ContentImage'

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
        image.tabIndex = image.complete && image.naturalWidth > 0 ? 0 : -1
        if (!image.getAttribute('role')) image.setAttribute('role', 'button')
        if (!image.getAttribute('aria-label')) {
          image.setAttribute('aria-label', image.alt ? `放大图片：${image.alt}` : '放大图片')
        }
      })
    }

    makeImagesZoomable()
    root.addEventListener('load', makeImagesZoomable, true)
    root.addEventListener('error', makeImagesZoomable, true)
    const observer = new MutationObserver(makeImagesZoomable)
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      root.removeEventListener('load', makeImagesZoomable, true)
      root.removeEventListener('error', makeImagesZoomable, true)
    }
  }, [])

  useEffect(() => {
    if (!preview) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') setPreview(null)
      if (event.key === 'Tab') {
        const buttons = [...document.querySelectorAll('.image-lightbox button:not([disabled])')]
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
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
    if (!src || !image.complete || !image.naturalWidth) return
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
            <ContentImage src={preview.src} alt={preview.alt} priority />
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