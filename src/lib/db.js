// IndexedDB-backed storage for cached content.
//
// Why not localStorage: it is synchronous, so every read blocks the main
// thread while the browser parses the whole string, it caps out around 5 MB,
// and it stores strings only. A setlist with lyrics and chords for a few dozen
// songs outgrows that quickly, and the parse cost lands exactly on the frame
// where the app is trying to draw.
//
// Interface preferences (theme, view mode, text scale) stay in localStorage —
// see storage.js. They are tiny, needed synchronously during the first render,
// and losing them is harmless. This module is only for content.

import { createStore, get, set, del, clear } from 'idb-keyval'

const DB_NAME = 'chords-app'
const STORE_NAME = 'cache-v1'

const store = createStore(DB_NAME, STORE_NAME)

export async function readCache(key) {
  try {
    return await get(key, store)
  } catch (err) {
    // A blocked or corrupted database must not take the app down: falling
    // through to the network is always a valid outcome.
    console.warn('IndexedDB read failed, falling back to network', err)
    return undefined
  }
}

export async function writeCache(key, value) {
  try {
    await set(key, value, store)
  } catch (err) {
    console.warn('IndexedDB write failed, cache not updated', err)
  }
}

export async function removeCache(key) {
  try {
    await del(key, store)
  } catch (err) {
    console.warn('IndexedDB delete failed', err)
  }
}

export async function clearCache() {
  try {
    await clear(store)
  } catch (err) {
    console.warn('IndexedDB clear failed', err)
  }
}

/** Storage shape TanStack's async persister expects. */
export const idbStorage = {
  getItem: (key) => readCache(key),
  setItem: (key, value) => writeCache(key, value),
  removeItem: (key) => removeCache(key),
}
