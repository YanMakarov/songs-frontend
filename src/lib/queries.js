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
import { queryKeys } from './queryKeys.js'

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

export function useSongQuery(songId) {
  return useQuery({
    queryKey: queryKeys.song(songId),
    queryFn: () => getSong(songId),
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
