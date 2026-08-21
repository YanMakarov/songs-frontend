// Connects the write queue to the query cache.
//
// Why song edits do not use a TanStack mutation, unlike everything else:
//
// 1. Coalescing. Typing produces an edit per keystroke; a mutation per
//    keystroke would be absurd. Mutations have no debounce or merge, so a
//    layer in front is needed regardless — and once it exists, it is the
//    natural owner of the request.
//
// 2. Surviving unmount. This was the whole point of phase 0: an edit must
//    land even if the editor is closed a moment later. A mutation started
//    from a component keeps running in the MutationCache, but its
//    observer-level callbacks are not guaranteed to fire once that component
//    is gone — and those callbacks are what write the result back. The queue
//    lives at module scope and has no such lifetime to lose.
//
// So: one-shot operations (create, delete, restore, reorder) are mutations,
// where optimistic-update-and-rollback is exactly the right shape. Continuous
// editing stays on the queue, and this module makes its results land in the
// same cache everything else reads from.

import { queryKeys } from './queryKeys.js'
import { sortSongs } from './queries.js'
import { blockedByLock } from './lockMode.js'
import { enqueue, subscribeConflict, subscribeSaved } from './writeQueue.js'

function stripLines(detail) {
  if (!detail) return detail
  const { lines, ...rest } = detail
  return rest
}

let attached = false

export function attachWriteQueue(queryClient) {
  // Guard against double-attachment under React StrictMode's double effects.
  if (attached) return () => {}
  attached = true

  const unsubscribeSaved = subscribeSaved((songId, updated, meta) => {
    if (!updated) return
    queryClient.setQueryData(queryKeys.song(songId), (prev) =>
      // Metadata from the server, lines from local state: the user may have
      // kept typing while this request was in flight, and those keystrokes
      // are already queued behind it.
      prev ? { ...prev, ...stripLines(updated) } : updated,
    )
    queryClient.setQueryData(queryKeys.songs(), (prev) => {
      const summary = stripLines(updated)
      const without = (prev || []).filter((s) => s.id !== summary.id)
      return sortSongs([...without, summary])
    })
    // The server folded someone else's edit into this write. The body on
    // screen is now ahead of what the user typed, so pull the merged version
    // in rather than leaving the local copy to drift.
    if (meta?.merged) {
      queryClient.invalidateQueries({ queryKey: queryKeys.song(songId) })
    }
  })

  const unsubscribeConflict = subscribeConflict((songId, error) => {
    // Someone else's version is now authoritative. Put it in the cache so any
    // list already on screen stops showing a value that no longer exists,
    // while the editor asks the user what to do with their own edit.
    if (error?.current) {
      queryClient.setQueryData(queryKeys.songs(), (prev) => {
        const summary = stripLines(error.current)
        const without = (prev || []).filter((s) => s.id !== summary.id)
        return sortSongs([...without, summary])
      })
    }
  })

  return () => {
    unsubscribeSaved()
    unsubscribeConflict()
    attached = false
  }
}

/**
 * Apply an edit locally and queue it for the server.
 *
 * The optimistic write deliberately leaves `rev` untouched: it stays at the
 * last version the server confirmed, which is exactly the base the queue must
 * send as `If-Match`.
 */
export function patchSong(queryClient, songId, patch) {
  // Guarded here rather than only in the interface: hiding buttons stops the
  // obvious paths, but keyboard shortcuts, drag handlers and anything added
  // later would all have to remember. One choke point cannot be forgotten.
  if (blockedByLock()) return
  const current = queryClient.getQueryData(queryKeys.song(songId))
  if (!current) return
  queryClient.setQueryData(queryKeys.song(songId), { ...current, ...patch })
  enqueue(songId, patch, current.rev)
}
