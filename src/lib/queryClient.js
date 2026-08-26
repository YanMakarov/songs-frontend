// Query client and its persistence.
//
// The point of persisting is the cold start: on open the app renders from the
// last known state immediately and revalidates in the background, instead of
// showing "Загружаем песню…" while a request flies. On a phone at a rehearsal
// with bad signal that is the difference between usable and not.

import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { idbStorage } from './db.js'

// Bump when the cached payload shape changes. The persister throws away
// anything stored under a different buster, which is what keeps a schema
// change from turning into "почистите кеш браузера".
const CACHE_BUSTER = 'v1'

// Long enough to collapse the burst of refetches from remounting a route,
// short enough that returning to the tab shows someone else's edit.
const BRIEFLY_FRESH = 5 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Deliberately short. A long stale time would be cheaper, but until
      // phase 3 lands, refetch-on-focus is the only way another member's edit
      // ever reaches this tab — and a minute of staleness would make the app
      // feel *less* live than it was before the cache existed. Revalidation
      // is nearly free anyway: the backend sends an ETag, so an unchanged
      // song costs one conditional request and an empty 304.
      staleTime: BRIEFLY_FRESH,
      gcTime: ONE_DAY,
      // `navigator.onLine` does not get a vote. React Query's default
      // ('online') refuses to even send a request while the browser claims to
      // be offline, and a paused query has no error and no timeout: it sits in
      // `pending` forever, which is the «Загружаем сетлист…» that never ends
      // and never sends a single request. The flag is unreliable in exactly
      // the situations this app runs in — an iOS PWA resumed from background,
      // a phone handing over between wifi and LTE, a laptop behind a VPN —
      // and it is stuck on `false` far more often than the network is
      // actually down. We already have a better answer to "is the server
      // reachable": ask it. Each request carries its own 20s timeout and
      // failures surface as `OfflineError`, so the query fails honestly and
      // the screen offers «Повторить» instead of hanging.
      networkMode: 'always',
      // Refetching on focus is the cheap half of collaboration — it is what
      // makes another member's edit show up without any polling at all.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // A missing or conflicting resource will not become available by
        // asking again, and neither will an unauthenticated one — retrying a
        // 401 only delays the login screen by three backoffs.
        const status = error?.status
        if (status === 401 || status === 404 || status === 412) return false
        return failureCount < 3
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: 0,
      // Same reason as above, and worse in effect: a paused mutation never
      // runs and never reports, so "создать песню" on a browser that thinks
      // it is offline is a button that does nothing at all.
      networkMode: 'always',
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'chords-app-query-cache',
  throttleTime: 1000,
})

export const persistOptions = {
  persister,
  maxAge: ONE_DAY,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    // Persist anything that holds data, including queries whose latest fetch
    // failed: React Query keeps the last good `data` next to the error, and
    // that copy is precisely what the app needs offline. Filtering on
    // `status === 'success'` instead looks reasonable and is wrong — one
    // failed refetch while the server is down drops the song list from the
    // cache, so the next reload has nothing to show.
    shouldDehydrateQuery: (query) => query.state.data !== undefined,
  },
}
