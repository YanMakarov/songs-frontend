// Per-song notes, local to this device.
//
// Deliberately a different database from db.js. That one is a *cache*: signing
// out wipes it wholesale (auth.jsx), the query persister owns its keys, and
// anything in it is expected to be re-fetchable from the server. Notes are the
// user's own writing, exist nowhere else, and must survive both a sign-out and
// a cache eviction — so they get their own store that nothing else clears.
//
// Nothing here ever reaches the network: notes are not part of the song and
// are not shared with the group.

import { createStore, get, set, del } from 'idb-keyval'

const DB_NAME = 'chords-app-notes'
const STORE_NAME = 'notes-v1'

const store = createStore(DB_NAME, STORE_NAME)

// Same reasoning as db.js: a blocked `indexedDB.open()` settles neither way,
// so a bare `await` can hang forever. Losing a read means an empty editor for
// a moment; hanging means a screen that never renders.
const IDB_TIMEOUT_MS = 3000
const TIMED_OUT = Symbol('idb-timeout')

function withTimeout(promise) {
  let timer
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), IDB_TIMEOUT_MS)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

function key(songId) {
  return `note:${songId}`
}

/** @returns {Promise<{ html: string, updatedAt: string } | null>} */
export async function readNote(songId) {
  if (!songId) return null
  try {
    const value = await withTimeout(get(key(songId), store))
    if (value === TIMED_OUT) {
      console.warn('IndexedDB did not answer in time, notes not loaded')
      return null
    }
    if (value && typeof value.html === 'string') return value
    return null
  } catch (err) {
    console.warn('Failed to read the note', err)
    return null
  }
}

export async function writeNote(songId, html) {
  if (!songId) return
  try {
    await withTimeout(set(key(songId), { html, updatedAt: new Date().toISOString() }, store))
  } catch (err) {
    console.warn('Failed to save the note', err)
  }
}

export async function removeNote(songId) {
  if (!songId) return
  try {
    await withTimeout(del(key(songId), store))
  } catch (err) {
    console.warn('Failed to delete the note', err)
  }
}
