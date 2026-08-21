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
  }
}

/**
 * Entity tag for a song version. Built locally rather than read from the
 * response header: `rev` is already in the body, and this keeps writes working
 * even where CORS hides the `ETag` header.
 */
export function etagFor(songId, rev) {
  return `W/"${songId}-${rev}"`
}

async function request(path, { method = 'GET', body, headers = {}, keepalive = false } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const mergedHeaders = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...identityHeaders(),
    ...headers,
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: mergedHeaders,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    keepalive: keepalive || undefined,
  })

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
    const detail = payload?.detail || response.statusText || 'Request failed'
    throw new ApiError(typeof detail === 'string' ? detail : 'Request failed', response.status, payload)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
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
    return getSong(songId)
  }
  return request(`${SONGS_ENDPOINT}/${songId}`, {
    method: 'PATCH',
    body: patch,
    headers: rev == null ? {} : { 'If-Match': etagFor(songId, rev) },
    keepalive,
  })
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

export async function deleteMovableShape(shapeId) {
  await request(`/movable-shapes/${shapeId}`, { method: 'DELETE' })
}

export async function importPdf(file) {
  if (!file) return null
  const formData = new FormData()
  formData.append('file', file)
  return request(`/pdf/import`, { method: 'POST', body: formData })
}

export { toSummary }
