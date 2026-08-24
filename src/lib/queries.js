// Read side of the cache.
//
// Note on ETags: plan item 2.3 called for sending `If-None-Match` by hand.
// It turned out to be redundant — the backend sends `Cache-Control: no-cache`,
// which already makes the browser revalidate every request conditionally and
// skip the body on 304. Doing it again in JS would save nothing and would mean
// handling empty 304 bodies ourselves, so the browser keeps that job.

import { useQuery } from '@tanstack/react-query'
import {
  getSetlist,
  getSong,
  listDeletedSongs,
  listMovableShapes,
  listSongs,
} from './api.js'
import { reuseLineIds } from './lineIdentity.js'
import { queryKeys } from './queryKeys.js'
import { getPendingPatch } from './writeQueue.js'

export function useSetlistQuery() {
  return useQuery({
    queryKey: queryKeys.setlist(),
    queryFn: getSetlist,
  })
}

export function useSongsQuery() {
  return useQuery({
    queryKey: queryKeys.songs(),
    queryFn: listSongs,
    select: sortSongs,
  })
}

/**
 * Read a song, then put back whatever the write queue still owes the server.
 *
 * The server's copy is behind by exactly that much: an edit made while this
 * request was in flight, or one still waiting out the debounce. Storing it
 * as-is is a visible rollback — the chord the user just added blinks out of
 * the song and only sticks when they add it a second time. `rev` still comes
 * from the server, so the next write is based on the version just read.
 *
 * Line and chord ids are carried over from the copy already in the cache — see
 * lineIdentity.js. The server mints new ones on every read, and taking them at
 * face value remounts every row and invalidates the ids any open popover is
 * holding, which loses the edit the user is in the middle of making.
 *
 * @param {string} songId
 * @param {object} [previous] the song as it currently sits in the cache
 */
export async function fetchSongWithPendingEdits(songId, previous) {
  const fetched = await getSong(songId)
  const stable = Array.isArray(fetched?.lines)
    ? { ...fetched, lines: reuseLineIds(previous?.lines, fetched.lines) }
    : fetched
  const pending = getPendingPatch(songId)
  return pending ? { ...stable, ...pending } : stable
}

export function useSongQuery(songId) {
  return useQuery({
    queryKey: queryKeys.song(songId),
    queryFn: ({ client, queryKey }) =>
      fetchSongWithPendingEdits(songId, client.getQueryData(queryKey)),
    enabled: Boolean(songId),
  })
}

/**
 * The shared library of movable chord shapes.
 *
 * Through the cache rather than a bare `fetch` for two reasons. It is read
 * from two places that both mount often — the library page and the fingering
 * modal behind every chord in a song — and a cold round trip each time is the
 * whole delay you feel when tapping a chord. And it is persisted with the rest
 * of the cache, so offline the shapes are still there instead of the page
 * reporting an empty library.
 *
 * Longer `staleTime` than the songs: a shape is added once and then read for
 * months, so revalidating it every five seconds buys nothing.
 */
export function useMovableShapesQuery() {
  return useQuery({
    queryKey: queryKeys.movableShapes(),
    queryFn: listMovableShapes,
    staleTime: 5 * 60 * 1000,
  })
}

/** The trash. Only fetched when the user actually opens it. */
export function useDeletedSongsQuery(enabled = false) {
  return useQuery({
    queryKey: queryKeys.deletedSongs(),
    queryFn: listDeletedSongs,
    enabled,
    staleTime: 0,
  })
}

export function sortSongs(list) {
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => {
    const posDiff = (a.position ?? 0) - (b.position ?? 0)
    if (posDiff !== 0) return posDiff
    const aTime = new Date(a.createdAt ?? 0).valueOf()
    const bTime = new Date(b.createdAt ?? 0).valueOf()
    return aTime - bTime
  })
}
