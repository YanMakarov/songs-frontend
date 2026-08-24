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

// How long to wait on IndexedDB before deciding it is not going to answer.
//
// A `try`/`catch` only covers a request that *fails*. `indexedDB.open()` has a
// third outcome: blocked — another tab holding an older version of the
// database, a delete still pending, Safari dropping the connection on a
// restored page. A blocked open fires neither `success` nor `error`, so the
// promise below never settles and the `catch` never runs.
//
// That matters far beyond one missed cache read. The query cache is restored
// from here before anything is allowed to fetch, so a read that never settles
// leaves every query in the app `pending` forever — the whole interface sits
// on "Загрузка…" and not one request is ever sent. Reading the cache is an
// optimisation; giving up on it and going to the network is always correct.
const IDB_TIMEOUT_MS = 3000

const TIMED_OUT = Symbol('idb-timeout')

function withTimeout(promise) {
  let timer
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), IDB_TIMEOUT_MS)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

export async function readCache(key) {
  try {
    const value = await withTimeout(get(key, store))
    if (value === TIMED_OUT) {
      console.warn('IndexedDB did not answer in time, falling back to network')
      return undefined
    }
    return value
  } catch (err) {
    // A blocked or corrupted database must not take the app down: falling
    // through to the network is always a valid outcome.
    console.warn('IndexedDB read failed, falling back to network', err)
    return undefined
  }
}

export async function writeCache(key, value) {
  try {
    await withTimeout(set(key, value, store))
  } catch (err) {
    console.warn('IndexedDB write failed, cache not updated', err)
  }
}

export async function removeCache(key) {
  try {
    await withTimeout(del(key, store))
  } catch (err) {
    console.warn('IndexedDB delete failed', err)
  }
}

export async function clearCache() {
  try {
    await withTimeout(clear(store))
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
