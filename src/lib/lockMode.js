// Read-only lock.
//
// Purpose is narrow and physical: a phone on a music stand during a gig, in a
// pocket, or handed to someone to read from. One stray touch should not
// rewrite a song. Locked means *nothing* reaches the server or the cache —
// while everything about how the page is displayed stays adjustable, because
// that is exactly what a person reading from it needs.
//
// Not to be confused with the local/draft mode from phase 5 of the roadmap:
// that one lets you edit freely and withholds the result from the group.
// This one forbids editing altogether.
//
// Persisted deliberately: a lock that a page reload undoes is no use on stage.

const STORAGE_KEY = 'chords_app_locked_v1'

let locked = read()
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function write(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Blocked storage only costs persistence, not the mode itself.
  }
}

export function isLocked() {
  return locked
}

export function setLocked(value) {
  const next = Boolean(value)
  if (next === locked) return
  locked = next
  write(next)
  // A single class on the root lets the stylesheet retire edit affordances
  // without every component having to know about the mode.
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('is-locked', next)
  }
  listeners.forEach((fn) => fn())
}

export function subscribeLock(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Guard for write paths. Returns true when the write must not happen. */
export function blockedByLock() {
  return locked
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('is-locked', locked)
}
