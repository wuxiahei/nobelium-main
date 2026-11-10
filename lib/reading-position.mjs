export function readingMetrics ({ top, height, viewport, offset = 0, scrollY }) {
  const start = Math.max(0, top - offset)
  const range = Math.max(0, height - Math.max(1, viewport - offset))
  const progress = range > 0 ? Math.min(1, Math.max(0, (scrollY - start) / range)) : (scrollY >= start ? 1 : 0)
  return { start, range, progress }
}

export function parseReadingPosition (value, now = Date.now()) {
  try {
    const data = JSON.parse(value)
    if (!data || data.v !== 1 || !Number.isFinite(data.progress) || data.progress < 0.03 || data.progress >= 0.98) return null
    if (!Number.isFinite(data.updatedAt) || now - data.updatedAt > 90 * 86400000 || data.updatedAt > now + 60000) return null
    return { ...data, anchor: typeof data.anchor === 'string' ? data.anchor : '', anchorOffset: Number.isFinite(data.anchorOffset) ? data.anchorOffset : 0 }
  } catch { return null }
}
