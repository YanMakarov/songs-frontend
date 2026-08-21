// Keeping a tab in step with the rest of the group, without a socket.
//
// The whole mechanism is one cheap GET: "what changed after rev N?". On an
// unchanged setlist the answer is a few dozen bytes, which is what makes it
// affordable to ask often — and asking only while the tab is visible is what
// keeps it off the battery. A WebSocket would buy sub-second latency at the
// cost of a hub, sticky sessions, its own heartbeat and its own reconnect;
// for "see a bandmate's edit within half a minute" that is a bad trade.
//
// When latency does start to matter, the next step is SSE rather than WS:
// `Last-Event-ID` is already this cursor, and writes stay on REST.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getChanges, getSetlistState } from './api.js'
import { getAttribution } from './identity.js'
import { queryKeys } from './queryKeys.js'
import { sortSongs } from './queries.js'
import { loadRemoteChanges, noteRemoteChanges } from './remoteChanges.js'
import { hasPending } from './writeQueue.js'

//: How often to ask while the user is actually looking at the app.
const ACTIVE_INTERVAL_MS = 30 * 1000
//: After this long without interaction, ask less. The tab is open but nobody
//: is reading it — a rehearsal where the phone sits on a music stand.
const IDLE_AFTER_MS = 5 * 60 * 1000
const IDLE_INTERVAL_MS = 120 * 1000
const FIRST_BACKOFF_MS = 5 * 1000
const MAX_BACKOFF_MS = 5 * 60 * 1000

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

/**
 * Fold one change-feed entry into the cache.
 * Returns the id if the change came from someone else and should be surfaced.
 */
function applyChange(queryClient, change, ourName) {
  const { id, deleted, song, updatedBy } = change

  if (deleted) {
    queryClient.setQueryData(queryKeys.songs(), (prev) => (prev || []).filter((s) => s.id !== id))
    queryClient.removeQueries({ queryKey: queryKeys.song(id) })
    return updatedBy && updatedBy !== ourName ? id : null
  }

  if (song) {
    queryClient.setQueryData(queryKeys.songs(), (prev) => {
      const without = (prev || []).filter((s) => s.id !== song.id)
      return sortSongs([...without, song])
    })
  }

  // Refetch the body only for songs someone is actually looking at:
  // invalidate refetches active queries and merely marks the rest stale.
  // Skipped while a local edit is still queued — pulling the server's copy
  // over unsaved work is exactly the surprise this is meant to avoid. The
  // banner tells the user instead, and the conflict path handles the rest.
  if (!hasPending(id)) {
    queryClient.invalidateQueries({ queryKey: queryKeys.song(id) })
  }

  return updatedBy && updatedBy !== ourName ? id : null
}

/** Full reconciliation, for a cursor that reaches further back than history. */
async function reconcile(queryClient) {
  const state = await getSetlistState()
  const known = queryClient.getQueryData(queryKeys.songs()) || []
  const live = new Set(state.songs.map((s) => s.id))
  for (const song of known) {
    if (!live.has(song.id)) queryClient.removeQueries({ queryKey: queryKeys.song(song.id) })
  }
  queryClient.setQueryData(queryKeys.songs(), (prev) => (prev || []).filter((s) => live.has(s.id)))
  queryClient.invalidateQueries({ queryKey: queryKeys.songs() })
  return state.rev
}

/**
 * Poll the setlist change feed. Mount once, at the top of the app.
 */
export function useSetlistSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timer = null
    let stopped = false
    let failures = 0
    let inFlight = false
    let lastInteraction = Date.now()

    const markInteraction = () => {
      lastInteraction = Date.now()
    }

    function nextDelay() {
      if (failures > 0) {
        return Math.min(FIRST_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS)
      }
      const idle = Date.now() - lastInteraction > IDLE_AFTER_MS
      return idle ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS
    }

    function schedule() {
      if (stopped) return
      clearTimeout(timer)
      timer = setTimeout(tick, nextDelay())
    }

    async function tick() {
      if (stopped) return
      // Several triggers can land at once — a tab regaining focus fires both
      // `visibilitychange` and `focus`, and the interval may be due as well.
      // Without this guard they all read the same cursor before any of them
      // advances it, so the same changes get fetched and applied repeatedly.
      if (inFlight) return
      // Nothing is asked while the tab is hidden. This is the whole battery
      // story: an idle connection costs little, but waking the radio on a
      // timer in the background is what actually drains a phone.
      if (!isVisible()) return schedule()

      inFlight = true
      const stored = queryClient.getQueryData(queryKeys.syncRev())
      // No cursor yet means a first visit or a cleared cache. "Изменено"
      // means "changed since you last looked", and there is no such moment to
      // compare against — marking the whole setlist would be noise the user
      // then has to click through one song at a time.
      const coldStart = stored == null
      const since = stored ?? 0
      try {
        const result = await getChanges(since)
        failures = 0

        if (result.tooOld) {
          const rev = await reconcile(queryClient)
          queryClient.setQueryData(queryKeys.syncRev(), rev)
        } else {
          const ourName = getAttribution()
          const touchedBy = {}
          for (const change of result.changes || []) {
            const id = applyChange(queryClient, change, ourName)
            // Attribution is per song: taking the last author of the batch
            // and pinning it on every entry tells the user a plain untruth
            // about who changed what.
            if (id && !coldStart) touchedBy[id] = change.updatedBy
          }
          noteRemoteChanges(touchedBy)
          queryClient.setQueryData(queryKeys.syncRev(), result.rev)
        }
      } catch (err) {
        failures += 1
        console.warn('Не удалось получить изменения сетлиста', err)
      } finally {
        inFlight = false
      }
      schedule()
    }

    function onVisibility() {
      if (!isVisible()) return
      markInteraction()
      // Coming back to the tab is the moment freshness matters most, and the
      // most common one: people return to the app far more often than they
      // sit in it continuously.
      failures = 0
      void tick()
    }

    // First pass on mount, then on every return of attention.
    void loadRemoteChanges()
    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    window.addEventListener('online', onVisibility)
    window.addEventListener('pointerdown', markInteraction, { passive: true })
    window.addEventListener('keydown', markInteraction, { passive: true })

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
      window.removeEventListener('online', onVisibility)
      window.removeEventListener('pointerdown', markInteraction)
      window.removeEventListener('keydown', markInteraction)
    }
  }, [queryClient])
}
