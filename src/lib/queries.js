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
