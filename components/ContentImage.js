import { useEffect, useRef, useState } from 'react'

export default function ContentImage (props) {
  return <ImageState key={props.src} {...props} />
}

function ImageState ({ src, alt = '', width, height, style, className = '', priority, blurDataURL, placeholder, onLoad, onError, node, ...props }) {
  const imageRef = useRef(null)
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const ratio = Number(width) > 0 && Number(height) > 0 ? `${Number(width)} / ${Number(height)}` : undefined
  useEffect(() => {
    if (imageRef.current?.complete) setState(imageRef.current.naturalWidth > 0 ? 'loaded' : 'error')
  }, [src, attempt])
  return (
    <span className={'content-image content-image-' + state} style={state !== 'loaded' && ratio ? { aspectRatio: ratio } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} key={attempt} ref={imageRef} src={src} alt={alt} width={width || undefined} height={height || undefined} style={style} className={className} loading={priority ? 'eager' : 'lazy'} decoding="async" onLoad={event => { setState('loaded'); onLoad?.(event) }} onError={event => { setState('error'); onError?.(event) }} />
      {state === 'loading' && <span className="content-image-placeholder" role="status">图片加载中…</span>}
      {state === 'error' && (
        <span className="content-image-error" role="status">
          <span>图片加载失败{alt ? `：${alt}` : ''}</span>
          <button type="button" className="ink-command" onClick={() => { setState('loading'); setAttempt(current => current + 1) }}>重新加载图片</button>
        </span>
      )}
    </span>
  )
}

// Keep Notion's small icons and covers in their original layout.
export function NotionContentImage ({ className, priority, blurDataURL, placeholder, ...props }) {
  if (className) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} className={className} loading={priority ? 'eager' : 'lazy'} alt={props.alt || ''} />
  }
  return <ContentImage {...props} priority={priority} />
}
