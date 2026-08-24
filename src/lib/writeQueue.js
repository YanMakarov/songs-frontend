// Outgoing song edits, queued at module scope.
//
// Why not inside the component: the previous implementation kept the pending
// patch in a ref and retried on a timer owned by the editor route. When the
// route unmounted mid-flight — navigating to another song, or back to the list
// — a failed request re-queued itself into a ref nobody would ever read again,
// and the retry timer was guarded by a flag that was already false. The edit
// disappeared without a trace. Living at module scope, the queue outlives every
// component and keeps retrying until the write lands.
//
// Guarantees:
//   * one request in flight per song (later edits merge into the pending patch)
//   * retries with exponential backoff, forever, until success or conflict
//   * a conflict stops retrying and is reported once — phase 4 will merge here
//
// Phase 2 replaces this module with TanStack Query mutations.

import { AuthError, ConflictError, updateSong } from './api.js'

const DEBOUNCE_MS = 400
const FIRST_RETRY_MS = 1000
const MAX_RETRY_MS = 30000

/**
 * @typedef {object} Entry
 * @property {object} patch     merged fields still to send
 * @property {object|null} inFlight  fields the request in flight is carrying
 * @property {number|null} rev  version the pending edits are based on
 * @property {number} timer     debounce/backoff timeout id
 * @property {number} attempt   consecutive failures
 * @property {boolean} sending  a request is in flight
 * @property {string|null} error
 */

/** @type {Map<string, Entry>} */
const entries = new Map()
const statusListeners = new Set()
const savedListeners = new Set()
const conflictListeners = new Set()

function emit(listeners, ...args) {
  listeners.forEach((fn) => {
    try {
      fn(...args)
    } catch (err) {
      console.error(err)
    }
  })
}

function notifyStatus(songId) {
  const entry = entries.get(songId)
  emit(statusListeners, songId, {
    pending: Boolean(entry),
    sending: Boolean(entry?.sending),
    error: entry?.error || null,
  })
}

function clearTimer(entry) {
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = 0
  }
}

/**
 * Queue a patch. Repeated calls for the same song merge into one request, so
 * typing produces a single PATCH per debounce window rather than one per key.
 *
 * @param {string} songId
 * @param {object} patch  changed fields only
 * @param {number} [rev]  version these edits are based on. Only the first
 *   pending call sets it: later edits build on the same base until the write
 *   lands, which is exactly what `If-Match` needs to mean.
 */
export function enqueue(songId, patch, rev) {
  if (!songId || !patch) return
  const entry = entries.get(songId) || {
    patch: {},
    inFlight: null,
    rev: rev ?? null,
    timer: 0,
    attempt: 0,
    sending: false,
    error: null,
  }
  entry.patch = { ...entry.patch, ...patch }
  if (entry.rev == null && rev != null) entry.rev = rev
  entries.set(songId, entry)

  if (!entry.timer && !entry.sending) {
    entry.timer = setTimeout(() => {
      entry.timer = 0
      void send(songId)
    }, DEBOUNCE_MS)
  }
  notifyStatus(songId)
}

async function send(songId, { keepalive = false } = {}) {
  const entry = entries.get(songId)
  if (!entry || entry.sending) return
  const patch = entry.patch
  if (!patch || Object.keys(patch).length === 0) {
    entries.delete(songId)
    notifyStatus(songId)
    return
  }

  entry.sending = true
  entry.inFlight = patch
  entry.patch = {}
  notifyStatus(songId)

  try {
    const { data: updated, merged, overwritten } = await updateSong(songId, patch, {
      rev: entry.rev ?? undefined,
      keepalive,
    })
    const current = entries.get(songId)
    if (!current) return
    current.sending = false
    current.inFlight = null
    current.attempt = 0
    current.error = null
    // Edits made while the request was in flight rebase onto what came back.
    current.rev = updated?.rev ?? null
    // `merged` means the server combined this write with someone else's
    // without needing to ask — worth telling the user quietly, since their
    // song just changed in ways they did not type.
    emit(savedListeners, songId, updated, { merged, overwritten })
    if (Object.keys(current.patch).length > 0) {
      current.timer = setTimeout(() => {
        current.timer = 0
        void send(songId)
      }, DEBOUNCE_MS)
      notifyStatus(songId)
    } else {
      entries.delete(songId)
      notifyStatus(songId)
    }
  } catch (err) {
    const current = entries.get(songId)
    if (!current) return
    current.sending = false
    current.inFlight = null
    // Put the unsent fields back underneath anything typed since.
    current.patch = { ...patch, ...current.patch }

    if (err instanceof AuthError) {
      // The edit is not lost and not wrong — it just has nobody to attribute
      // it to yet. Hold it without a retry timer: backing off against a
      // session that will not come back on its own only burns battery. The
      // auth layer calls `flushAll` once the user signs in again.
      current.attempt = 0
      current.error = 'Нужно войти заново — правки сохранены'
      clearTimer(current)
      notifyStatus(songId)
      return
    }

    if (err instanceof ConflictError) {
      // Someone else got there first. Retrying would either fail forever or,
      // without a precondition, silently overwrite their work — so stop and
      // hand the decision to the user. Phase 4 merges instead.
      entries.delete(songId)
      notifyStatus(songId)
      emit(conflictListeners, songId, err)
      return
    }

    current.attempt += 1
    current.error = 'Не удалось сохранить изменения'
    const delay = Math.min(FIRST_RETRY_MS * 2 ** (current.attempt - 1), MAX_RETRY_MS)
    clearTimer(current)
    current.timer = setTimeout(() => {
      current.timer = 0
      void send(songId)
    }, delay)
    notifyStatus(songId)
    console.error(err)
  }
}

/** Send a song's pending edits now, skipping the debounce. Resolves when idle. */
export async function flush(songId, options) {
  const entry = entries.get(songId)
  if (!entry) return
  clearTimer(entry)
  entry.attempt = 0
  await send(songId, options)
}

/** Send everything pending. Used before the page goes away. */
export async function flushAll(options) {
  await Promise.all([...entries.keys()].map((songId) => flush(songId, options)))
}

/** Retry now — what the "Повторить" button in the save banner calls. */
export function retry(songId) {
  return flush(songId)
}

export function hasPending(songId) {
  return songId ? entries.has(songId) : entries.size > 0
}

/**
 * The fields this song still owes the server: what is waiting out the debounce
 * plus whatever a request in flight is carrying. Returns `null` when the queue
 * is empty for that song.
 *
 * A copy of the song fetched from the server predates all of it — the write
 * either has not been sent yet or has not been answered — so whoever puts that
 * copy in the cache has to lay these fields back on top of it. Without that,
 * a refetch landing in the window between an edit and its acknowledgement
 * silently rolls the edit back on screen while the queue happily saves it.
 */
export function getPendingPatch(songId) {
  const entry = entries.get(songId)
  if (!entry) return null
  const merged = { ...(entry.inFlight || {}), ...entry.patch }
  return Object.keys(merged).length > 0 ? merged : null
}

export function getStatus(songId) {
  const entry = entries.get(songId)
  return {
    pending: Boolean(entry),
    sending: Boolean(entry?.sending),
    error: entry?.error || null,
  }
}

/**
 * Drop a song's pending edits without sending them. For recovering from a
 * conflict by taking the server's version.
 */
export function discard(songId) {
  const entry = entries.get(songId)
  if (!entry) return
  clearTimer(entry)
  entries.delete(songId)
  notifyStatus(songId)
}

/**
 * Drop every song's pending edits. For signing out, and for signing in as
 * somebody else.
 *
 * The queue is module state, so it outlives the React tree that a sign-out
 * unmounts. Left alone, edits typed by the previous account would be sent
 * under the next one's session and recorded as theirs.
 */
export function discardAll() {
  const ids = [...entries.keys()]
  for (const id of ids) {
    const entry = entries.get(id)
    if (entry) clearTimer(entry)
    entries.delete(id)
    notifyStatus(id)
  }
}

/** @param {(songId: string, status: {pending: boolean, sending: boolean, error: string|null}) => void} fn */
export function subscribeStatus(fn) {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

/**
 * Fired with the server's response after every successful write. The third
 * argument reports whether the write was merged with someone else's and which
 * metadata fields it overwrote.
 */
export function subscribeSaved(fn) {
  savedListeners.add(fn)
  return () => savedListeners.delete(fn)
}

/** @param {(songId: string, error: import('./api.js').ConflictError) => void} fn */
export function subscribeConflict(fn) {
  conflictListeners.add(fn)
  return () => conflictListeners.delete(fn)
}

if (typeof window !== 'undefined') {
  // `pagehide` fires on tab close, navigation and (unlike `unload`) the mobile
  // back/forward cache. Requests started here use `keepalive` inside api.js so
  // the browser lets them finish after the document is gone.
  window.addEventListener('pagehide', () => {
    void flushAll({ keepalive: true })
  })
  // Coming back online is the cheapest moment to drain a backlog.
  window.addEventListener('online', () => {
    void flushAll()
  })
}
