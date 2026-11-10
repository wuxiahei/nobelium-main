import { useEffect, useState } from 'react'
import ActionFeedback from '@/components/ActionFeedback'
import { Check, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@/lib/clipboard.mjs'
import {
  getPrismLanguageLabel,
  hasPrismLanguage,
  highlightPrismCode,
  loadPrismLanguage,
  normalizePrismLanguage
} from '@/lib/prism-language.mjs'

export default function MarkdownCodeBlock ({ code, className }) {
  const language = extractLanguage(className)
  const normalizedLanguage = normalizePrismLanguage(language)
  const [highlighted, setHighlighted] = useState('')
  const [copyState, setCopyState] = useState('idle')

  useEffect(() => {
    let cancelled = false
    setHighlighted('')

    if (!hasPrismLanguage(normalizedLanguage)) return undefined

    loadPrismLanguage(normalizedLanguage)
      .then(() => {
        if (!cancelled) setHighlighted(highlightPrismCode(code, normalizedLanguage))
      })
      .catch(() => {
        if (!cancelled) setHighlighted('')
      })

    return () => {
      cancelled = true
    }
  }, [code, normalizedLanguage])

  useEffect(() => {
    if (copyState === 'idle') return undefined
    const timeout = window.setTimeout(() => setCopyState('idle'), 1800)
    return () => window.clearTimeout(timeout)
  }, [copyState])

  async function handleCopy () {
    const copied = await copyTextToClipboard(code)
    setCopyState(copied ? 'copied' : 'failed')
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span>{getPrismLanguageLabel(language)}</span>
        <button type="button" onClick={handleCopy} aria-label="复制代码">
          {copyState === 'copied'
            ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
            : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制'}</span>
        </button>
      </div>
      {copyState !== 'idle' && <ActionFeedback state={copyState === 'failed' ? 'error' : 'success'}>{copyState === 'failed' ? '复制失败，请选中代码手动复制。' : '代码已复制。'}</ActionFeedback>}
      <pre>
        <code
          className={normalizedLanguage ? `language-${normalizedLanguage}` : undefined}
          {...(highlighted ? { dangerouslySetInnerHTML: { __html: highlighted } } : { children: code })}
        />
      </pre>
    </div>
  )
}

function extractLanguage (className) {
  const match = String(className || '').match(/(?:^|\s)language-([^\s]+)/)
  return match?.[1] || ''
}