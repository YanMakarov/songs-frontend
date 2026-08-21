// Who is making a change.
//
// Not authentication: there is no sign-in yet, and both values below are
// client-supplied, so the server treats them as attribution for the interface
// and nothing more. They exist so a conflict banner can say "Песню изменил
// Вася" instead of "кто-то". When real accounts arrive, the server starts
// reading the session instead and this module goes away.

const CLIENT_ID_KEY = 'chords_app_client_id_v1'
const DISPLAY_NAME_KEY = 'chords_app_display_name_v1'

let cachedId = null

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Stable per browser profile, created on first use.
export function getClientId() {
  if (cachedId) return cachedId
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = randomId()
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    cachedId = id
  } catch {
    // Private mode or blocked storage: fall back to a per-session id rather
    // than failing every write.
    cachedId = randomId()
  }
  return cachedId
}

export function getDisplayName() {
  try {
    return (localStorage.getItem(DISPLAY_NAME_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setDisplayName(name) {
  const trimmed = (name || '').trim().slice(0, 60)
  try {
    if (trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed)
    else localStorage.removeItem(DISPLAY_NAME_KEY)
  } catch {
    // ignore
  }
}

/**
 * The string the server will record as `updated_by` for our writes.
 *
 * Mirrors the fallback in the backend's `get_author`, so the sync layer can
 * recognise its own edits coming back through the change feed and not
 * announce them as somebody else's.
 */
export function getAttribution() {
  const name = getDisplayName()
  if (name) return name.slice(0, 60)
  return `anon-${getClientId().slice(0, 8)}`
}

// Header values must be ISO-8859-1 — `fetch` throws outright on "Вася" — so
// the name travels percent-encoded and the server decodes it.
export function identityHeaders() {
  const headers = { 'X-Client-Id': getClientId() }
  const name = getDisplayName()
  if (name) headers['X-Client-Name'] = encodeURIComponent(name)
  return headers
}
