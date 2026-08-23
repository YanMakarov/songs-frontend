import { identityHeaders } from './identity.js'

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
const shouldUseProxy = import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL
const API_BASE_URL = shouldUseProxy ? '' : rawBaseUrl.replace(/\/$/, '')
const SETLIST_SLUG = import.meta.env.VITE_SETLIST_SLUG || 'setlist1'
const SETLIST_ENDPOINT = `/setlists/${SETLIST_SLUG}`
const SONGS_ENDPOINT = `/setlists/${SETLIST_SLUG}/songs`

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

/**
 * A write was based on a version the server has already moved past.
 * Carries the server's current state so the caller can recover without a
 * second request.
 */
export class ConflictError extends ApiError {
  constructor(payload) {
    const detail = payload?.detail || {}
    super(detail.message || 'Песня изменилась на сервере', 412, payload)
    this.current = detail.current || null
    this.currentRev = detail.currentRev ?? null
    this.expectedRev = detail.expectedRev ?? null
    this.updatedBy = detail.current?.updatedBy || null
    // 'lines'   — the same lines were edited from both sides
    // 'no_base' — the version this edit was based on has aged out of history
    this.reason = detail.reason || 'lines'
  }
}

/**
 * The session either ran out or was never there.
 *
 * `reason` separates the two, and the difference decides what the app does:
 * 'expired' means we were signed in and the cached songs are still ours to
 * show, while 'anonymous' means there is nothing to keep. Never thrown for a
 * network failure — see `isOffline` — because "no signal" must not look like
 * "signed out".
 */
export class AuthError extends ApiError {
  constructor(payload) {
    const detail = payload?.detail || {}
    super(detail.message || 'Требуется вход', 401, payload)
    this.reason = detail.reason === 'expired' ? 'expired' : 'anonymous'
  }
}

/**
 * The request never reached the server.
 *
 * `fetch` rejects rather than resolving, so this is the one failure with no
 * status at all — and the one the offline-first parts of the app must treat
 * as "ask again later" instead of an error.
 */
export class OfflineError extends ApiError {
  constructor(cause) {
    super('Нет связи с сервером', 0, null)
    this.cause = cause
  }
}

export function isOffline(error) {
  return error instanceof OfflineError
}

/** Called with the `AuthError` whenever a request comes back unauthenticated. */
let onUnauthorized = null

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Entity tag for a song version. Built locally rather than read from the
 * response header: `rev` is already in the body, and this keeps writes working
 * even where CORS hides the `ETag` header.
 */
export function etagFor(songId, rev) {
  return `W/"${songId}-${rev}"`
}

async function request(path, options) {
  const { data } = await requestWithMeta(path, options)
  return data
}

/**
 * Like `request`, but also returns the response headers the API uses to
 * report what it did with a write — whether it merged, and which fields it
 * took away from someone else.
 */
async function requestWithMeta(path, { method = 'GET', body, headers = {}, keepalive = false } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const mergedHeaders = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...identityHeaders(),
    ...headers,
  }
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: mergedHeaders,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      keepalive: keepalive || undefined,
      // The session cookie is HttpOnly and lives on the API host, so it only
      // travels if the request asks for it. Without this every call is
      // anonymous and the whole app answers 401.
      credentials: 'include',
    })
  } catch (err) {
    // DNS failure, dropped connection, aeroplane mode. Distinct from any HTTP
    // status: the caller can retry this one, and the write queue does.
    throw new OfflineError(err)
  }

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      // ignore parsing errors
    }
    if (response.status === 412) {
      throw new ConflictError(payload)
    }
    if (response.status === 401) {
      const error = new AuthError(payload)
      // One place decides what an expired session means — see lib/auth.jsx.
      // Doing it here rather than at every call site is what keeps the
      // handling from drifting apart between screens.
      if (onUnauthorized) onUnauthorized(error)
      throw error
    }
    const detail = payload?.detail || response.statusText || 'Request failed'
    throw new ApiError(typeof detail === 'string' ? detail : 'Request failed', response.status, payload)
  }

  if (response.status === 204) {
    return { data: null, merged: false, overwritten: [] }
  }

  const overwritten = response.headers.get('X-Overwritten-Fields')
  return {
    data: await response.json(),
    merged: response.headers.get('X-Merged') === 'true',
    overwritten: overwritten ? overwritten.split(',').filter(Boolean) : [],
  }
}

function toSummary(song) {
  if (!song) return song
  const { lines, ...rest } = song
  return rest
}

export async function listSongs() {
  const data = await request(`${SONGS_ENDPOINT}/`)
  return Array.isArray(data) ? data : []
}

export async function getSetlist() {
  return request(SETLIST_ENDPOINT)
}

export async function updateSetlist(patch) {
  if (!patch || typeof patch !== 'object') return getSetlist()
  return request(SETLIST_ENDPOINT, { method: 'PATCH', body: patch })
}

export async function createSong(payload = {}) {
  const detail = await request(`${SONGS_ENDPOINT}/`, { method: 'POST', body: payload })
  return detail
}

export async function getSong(songId) {
  return request(`${SONGS_ENDPOINT}/${songId}`)
}

/**
 * @param {object} patch  changed fields only
 * @param {object} [options]
 * @param {number} [options.rev]  version this edit was based on; sent as
 *   `If-Match` so the server refuses to overwrite someone else's newer change.
 *   Omitting it keeps the old last-write-wins behaviour.
 * @param {boolean} [options.keepalive]  let the request outlive the page,
 *   for the final flush on `pagehide`.
 * @throws {ConflictError} on 412
 */
export async function updateSong(songId, patch, { rev, keepalive } = {}) {
  if (!patch || typeof patch !== 'object') {
    return { data: await getSong(songId), merged: false, overwritten: [] }
  }
  return requestWithMeta(`${SONGS_ENDPOINT}/${songId}`, {
    method: 'PATCH',
    body: patch,
    headers: rev == null ? {} : { 'If-Match': etagFor(songId, rev) },
    keepalive,
  })
}

/** Edit history of a song — who changed it and when. */
export async function listRevisions(songId) {
  const data = await request(`${SONGS_ENDPOINT}/${songId}/revisions`)
  return Array.isArray(data) ? data : []
}

/** Soft delete. Returns the deleted song, which is what `restoreSong` undoes. */
export async function deleteSong(songId, { rev } = {}) {
  return request(`${SONGS_ENDPOINT}/${songId}`, {
    method: 'DELETE',
    headers: rev == null ? {} : { 'If-Match': etagFor(songId, rev) },
  })
}

export async function restoreSong(songId) {
  return request(`${SONGS_ENDPOINT}/${songId}/restore`, { method: 'POST' })
}

/** Songs in the trash, newest deletion first. */
export async function listDeletedSongs() {
  const data = await request(`${SONGS_ENDPOINT}/?deleted=1`)
  return Array.isArray(data) ? data : []
}

/**
 * What changed since `rev`. The polling endpoint for phase 3 — cheap enough to
 * call on every window focus.
 */
export async function getChanges(since = 0) {
  return request(`${SETLIST_ENDPOINT}/changes?since=${Number(since) || 0}`)
}

/** Every live song as {id, rev} — full reconciliation after a lost cursor. */
export async function getSetlistState() {
  return request(`${SETLIST_ENDPOINT}/state`)
}

export async function reorderSongs(order) {
  if (!Array.isArray(order)) return
  await request(`${SONGS_ENDPOINT}/reorder`, { method: 'POST', body: { order } })
}

export async function listMovableShapes() {
  const data = await request(`/movable-shapes/`)
  return Array.isArray(data) ? data : []
}

export async function createMovableShape(payload) {
  return request(`/movable-shapes/`, { method: 'POST', body: payload })
}

export async function renameMovableShape(shapeId, name) {
  return request(`/movable-shapes/${shapeId}`, { method: 'PATCH', body: { name } })
}

export async function deleteMovableShape(shapeId) {
  await request(`/movable-shapes/${shapeId}`, { method: 'DELETE' })
}

export async function importPdf(file) {
  if (!file) return null
  const formData = new FormData()
  formData.append('file', file)
  return request(`/pdf/import`, { method: 'POST', body: formData })
}

/**
 * Sign in. The session arrives as a `Set-Cookie` the page never sees; the
 * body is only there so the UI can greet the user by name.
 */
export async function login(username, password) {
  return request('/auth/login', { method: 'POST', body: { username, password } })
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' })
}

/**
 * Who the server thinks we are.
 *
 * Answers 200 with `authenticated: false` rather than 401 when nobody is
 * signed in, so a cold start can tell "not signed in" from "the server is
 * unreachable" — which `OfflineError` covers — without treating either as a
 * failure.
 */
export async function fetchAuthState() {
  return request('/auth/me')
}

export { toSummary }
