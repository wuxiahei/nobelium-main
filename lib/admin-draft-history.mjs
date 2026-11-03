export const DRAFT_HISTORY_LIMIT = 5
export const DRAFT_STORAGE_VERSION = 2

export function createDraftSnapshot (form, updatedAt = Date.now()) {
  return {
    updatedAt: Number(updatedAt),
    form
  }
}

export function appendDraftSnapshot (existing, form, updatedAt = Date.now(), equals = defaultFormEquals) {
  const snapshot = createDraftSnapshot(form, updatedAt)
  const history = normalizeDraftSnapshots(existing)
  if (history.length && equals(history[0].form, form)) {
    history[0] = snapshot
  } else {
    history.unshift(snapshot)
  }
  return history.slice(0, DRAFT_HISTORY_LIMIT)
}

export function normalizeDraftSnapshots (value) {
  if (!Array.isArray(value)) return []
  return value
    .map(snapshot => {
      const updatedAt = Number(snapshot?.updatedAt)
      if (!snapshot?.form || !Number.isFinite(updatedAt)) return null
      return { updatedAt, form: snapshot.form }
    })
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DRAFT_HISTORY_LIMIT)
}

function defaultFormEquals (left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
