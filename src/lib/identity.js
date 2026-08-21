// Who is making a change.
//
// The server now takes the author from the session, so nothing here decides
// anything: the headers below are attribution of last resort, used only by a
// backend running with `SONGS_API_AUTH_MODE=disabled` — local development.
//
// What still matters in production is `getAttribution`. The change feed
// identifies each edit by display name, and this tab has to recognise its own
// edits coming back so it does not announce them as somebody else's. That
// name must therefore be the account's, which is why the auth layer pushes it
// here on sign-in.

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

// The signed-in account's display name — the one the server records. Held
// in a module variable rather than localStorage because it belongs to the
// session, not to the browser: it must disappear when the session does.
let sessionName = ''

/** Told by the auth layer whenever the signed-in user changes. */
export function setSessionDisplayName(name) {
  sessionName = (name || '').trim()
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
  // Session first: this is what the server actually writes to `updatedBy`.
  // The locally chosen name is only reached when there is no session, which
  // in production means there is nothing to attribute anyway.
  if (sessionName) return sessionName.slice(0, 60)
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
