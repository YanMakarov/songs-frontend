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

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const mergedHeaders = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...headers,
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: mergedHeaders,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      // ignore parsing errors
    }
    const detail = payload?.detail || response.statusText || 'Request failed'
    throw new ApiError(detail, response.status, payload)
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

export async function updateSong(songId, patch) {
  if (!patch || typeof patch !== 'object') {
    return getSong(songId)
  }
  return request(`${SONGS_ENDPOINT}/${songId}`, { method: 'PATCH', body: patch })
}

export async function deleteSong(songId) {
  await request(`${SONGS_ENDPOINT}/${songId}`, { method: 'DELETE' })
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
