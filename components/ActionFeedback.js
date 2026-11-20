import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react'

export default function ActionFeedback ({ state = 'success', children, onRetry, retryLabel = '重试' }) {
  if (!children) return null
  const Icon = state === 'error' ? AlertCircle : state === 'loading' ? LoaderCircle : CheckCircle2
  return (
    <div className={'action-feedback action-feedback-' + state} role={state === 'error' ? 'alert' : 'status'}>
      <Icon className={state === 'loading' ? 'feedback-spinner' : ''} size={16} aria-hidden="true" />
      <span>{children}</span>
      {onRetry && <button type="button" className="ink-command" onClick={onRetry}>{retryLabel}</button>}
    </div>
  )
}
