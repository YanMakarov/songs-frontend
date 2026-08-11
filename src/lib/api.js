const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const SETLIST_SLUG = import.meta.env.VITE_SETLIST_SLUG || 'setlist1'
const SONGS_ENDPOINT = `/setlists/${SETLIST_SLUG}/songs`

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
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

export { toSummary }
