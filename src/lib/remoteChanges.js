// Which songs someone else changed since the user last opened them.
//
// Deliberately NOT a React Query entry. Marks have to survive a reload, and a
// query that seeds itself — with `initialData` or a `queryFn` returning an
// empty map — races the cache hydration: whichever writes last wins, and the
// component almost always mounts first. The result is marks that vanish on
// every refresh, or stale ones that come back and cannot be dismissed.
//
// A plain store with its own persistence has no such ordering to lose.

import { readCache, writeCache } from './db.js'

const STORAGE_KEY = 'remote-changes-v1'

/** @type {Record<string, string>} songId → who changed it */
let marks = {}
let loaded = false
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

async function persist() {
  try {
    await writeCache(STORAGE_KEY, marks)
  } catch {
    // Losing a mark is a cosmetic problem; never let it break a write path.
  }
}

/** Restore marks written before the last reload. Call once at startup. */
export async function loadRemoteChanges() {
  if (loaded) return
  loaded = true
  const stored = await readCache(STORAGE_KEY)
  if (stored && typeof stored === 'object') {
    // Merge rather than replace: sync may already have recorded something
    // while this was in flight.
    marks = { ...stored, ...marks }
    emit()
  }
}

export function noteRemoteChanges(byId) {
  const ids = Object.keys(byId || {})
  if (!ids.length) return
  marks = { ...marks, ...byId }
  emit()
  void persist()
}

export function clearRemoteChange(songId) {
  if (!(songId in marks)) return
  const next = { ...marks }
  delete next[songId]
  marks = next
  emit()
  void persist()
}

export function getRemoteChanges() {
  return marks
}

export function subscribeRemoteChanges(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
