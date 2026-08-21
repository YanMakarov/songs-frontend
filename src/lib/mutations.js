// Write side of the cache: one-shot operations.
//
// Every mutation updates the cache before the request goes out and rolls back
// if it fails, so the interface never waits on the network to feel responsive.
//
// Editing a song is deliberately NOT here — it goes through writeQueue.js.
// See cacheBridge.js for the reasoning.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createSong,
  deleteSong,
  reorderSongs,
  restoreSong,
  updateSetlist,
  updateSong,
} from './api.js'
import { queryKeys } from './queryKeys.js'
import { sortSongs } from './queries.js'

/** Drop `lines` so a summary never overwrites the detail's line array. */
function toSummary(detail) {
  if (!detail) return detail
  const { lines, ...rest } = detail
  return rest
}

/** Merge a song's fields into the list without reordering it needlessly. */
function upsertSong(list, detail) {
  const summary = toSummary(detail)
  if (!summary) return list
  const without = (list || []).filter((s) => s.id !== summary.id)
  return sortSongs([...without, summary])
}

function removeSong(list, songId) {
  return (list || []).filter((s) => s.id !== songId)
}

export function useCreateSongMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => createSong(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.song(created.id), created)
      queryClient.setQueryData(queryKeys.songs(), (prev) => upsertSong(prev, created))
    },
  })
}

export function useDeleteSongMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ songId, rev }) => deleteSong(songId, { rev }),
    onMutate: async ({ songId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.songs() })
      const previous = queryClient.getQueryData(queryKeys.songs())
      queryClient.setQueryData(queryKeys.songs(), (prev) => removeSong(prev, songId))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.songs(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deletedSongs() })
    },
  })
}

export function useRestoreSongMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songId) => restoreSong(songId),
    onSuccess: (restored) => {
      queryClient.setQueryData(queryKeys.song(restored.id), restored)
      queryClient.setQueryData(queryKeys.songs(), (prev) => upsertSong(prev, restored))
      queryClient.invalidateQueries({ queryKey: queryKeys.deletedSongs() })
    },
  })
}

export function useReorderSongsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (order) => reorderSongs(order),
    onMutate: async (order) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.songs() })
      const previous = queryClient.getQueryData(queryKeys.songs())
      const byId = new Map((previous || []).map((s) => [s.id, s]))
      const next = order.map((id, index) => ({ ...byId.get(id), position: index })).filter(Boolean)
      queryClient.setQueryData(queryKeys.songs(), next)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.songs(), context.previous)
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.songs() })
    },
  })
}

export function useUpdateSetlistMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch) => updateSetlist(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.setlist() })
      const previous = queryClient.getQueryData(queryKeys.setlist())
      queryClient.setQueryData(queryKeys.setlist(), (prev) => (prev ? { ...prev, ...patch } : prev))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.setlist(), context.previous)
      }
    },
    onSuccess: (updated) => {
      if (updated) queryClient.setQueryData(queryKeys.setlist(), updated)
    },
  })
}
