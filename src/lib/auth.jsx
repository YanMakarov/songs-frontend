// Who is signed in, and what the app does when it stops being sure.
//
// The hard part is not the login form. It is that this app is expected to
// work with no signal — on a stage, in a basement — and every question about
// the session needs the server to answer it. So the rule here is: an answer
// from the server changes the state, and the *absence* of one never does.
// Being unable to reach the API leaves the last known user in place and the
// songs on screen; only the server actually saying "no" sends anyone to the
// login screen.
//
// The cost of that is a copy of the session's outcome in localStorage. It is
// not a credential — the cookie is HttpOnly and this cannot forge it, the
// server rechecks everything — it is a note saying who we expected to be, so
// the first paint after a cold start is songs rather than a spinner.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchAuthState,
  isOffline,
  login as apiLogin,
  logout as apiLogout,
  setUnauthorizedHandler,
} from './api.js'
import { clearCache } from './db.js'
import { setSessionDisplayName } from './identity.js'
import { discardAll, flushAll } from './writeQueue.js'

const SNAPSHOT_KEY = 'chords_app_auth_v1'

// How long the app will keep showing cached songs without the server ever
// confirming the session. Past this the local copy is wiped and a login is
// required. It exists for the phone left in a taxi: offline tolerance must
// not add up to "the setlist stays readable forever". Comfortably longer than
// any tour, comfortably shorter than the cookie's own 90 days.
const UNVERIFIED_GRACE_MS = 30 * 24 * 60 * 60 * 1000

function readSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

function writeSnapshot(user) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ user, verifiedAt: Date.now() }))
  } catch {
    // A missing snapshot costs a spinner on the next cold start, nothing more.
  }
}

function dropSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    // ignore
  }
}

function isStale(snapshot) {
  return !snapshot || Date.now() - (snapshot.verifiedAt || 0) > UNVERIFIED_GRACE_MS
}

const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const initial = readSnapshot()
  const expired = isStale(initial)

  // The user we believe we are. Starts from the snapshot so the first render
  // already has an answer — asking the server first would put a blank screen
  // in front of every cold start, including the offline ones where the
  // question can never be answered.
  const [user, setUser] = useState(expired ? null : initial?.user ?? null)
  // Set only by the server saying so. Never by a failed request.
  const [signedOut, setSignedOut] = useState(false)
  // False until the server has confirmed the session in this run of the app.
  const [verified, setVerified] = useState(false)
  // Reachability, as far as auth is concerned. Drives the "работаем офлайн"
  // note next to a session we could not check.
  const [reachable, setReachable] = useState(true)
  const [authMode, setAuthMode] = useState(null)
  const [checking, setChecking] = useState(true)

  // Read inside callbacks that must not re-subscribe when it changes.
  const userRef = useRef(user)
  userRef.current = user

  // Everything the previous account left on this device. IndexedDB alone is
  // not enough: the query cache lives in memory too, and the persister writes
  // it back a second later — clearing one without the other puts the songs
  // straight back. The write queue is module state and survives the unmount,
  // so its unsent edits would otherwise be sent under the next session.
  const forgetLocalData = useCallback(async () => {
    discardAll()
    queryClient.clear()
    await clearCache()
  }, [queryClient])

  useEffect(() => {
    if (!expired && initial?.user) {
      // Offline cold start: `/auth/me` may never answer, so the name the sync
      // layer needs has to come from the snapshot instead.
      setSessionDisplayName(initial.user.displayName)
    }
    if (expired && initial) {
      // The grace period ran out while the app was closed. Nothing here is
      // trustworthy any more, and the songs go with it.
      dropSnapshot()
      void forgetLocalData()
    }
    // Deliberately once, on mount: this is about how the app was started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyState = useCallback((state) => {
    setAuthMode(state?.authMode ?? null)
    if (state?.authenticated && state.user) {
      // The change feed names authors by display name, so the sync layer has
      // to know ours to tell our own edits from the rest of the band's.
      setSessionDisplayName(state.user.displayName)
      setUser(state.user)
      setSignedOut(false)
      setVerified(true)
      writeSnapshot(state.user)
      return true
    }
    setSessionDisplayName('')
    setUser(null)
    setSignedOut(true)
    setVerified(true)
    dropSnapshot()
    return false
  }, [])

  // A 401 from any request anywhere. The server has spoken, so this is one of
  // the few things allowed to sign the user out — but it still does not touch
  // the cached songs. They are wiped on an explicit sign-out, or when someone
  // else signs in, and not for a session that merely ran out: the person
  // holding the phone is almost certainly the same person, and taking their
  // setlist away mid-rehearsal to make a point about session hygiene is the
  // wrong trade.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSignedOut(true)
      setVerified(true)
      setReachable(true)
      dropSnapshot()
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const check = useCallback(async () => {
    try {
      const state = await fetchAuthState()
      setReachable(true)
      applyState(state)
    } catch (err) {
      if (isOffline(err)) {
        // The question could not be asked. That is not an answer, so nothing
        // about the session changes — the app keeps running on the snapshot.
        setReachable(false)
        return
      }
      throw err
    } finally {
      setChecking(false)
    }
  }, [applyState])

  useEffect(() => {
    void check()
  }, [check])

  // Coming back online is the first chance to find out whether the session
  // survived, and it is also when a held write queue can move again.
  useEffect(() => {
    function onOnline() {
      void check()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [check])

  const signIn = useCallback(
    async (username, password) => {
      const previous = userRef.current
      const state = await apiLogin(username, password)
      // A different account on the same device must not inherit the last
      // one's songs. Same account signing back in keeps them — that is the
      // ordinary "my session ran out" case, and re-downloading a setlist over
      // a phone connection is exactly what the cache exists to avoid.
      if (previous && previous.id !== state?.user?.id) {
        await forgetLocalData()
      }
      applyState(state)
      // Edits made while the session was gone are still queued.
      void flushAll().catch(() => {})
      return state
    },
    [applyState],
  )

  const signOut = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // Even if the server never hears about it, this device is signing out.
    }
    dropSnapshot()
    // An explicit sign-out is the one case where leaving the songs behind
    // would be wrong: the point of the button is to hand the device over.
    await forgetLocalData()
    setUser(null)
    setSignedOut(true)
    setVerified(true)
  }, [])

  const value = useMemo(
    () => ({
      user,
      authMode,
      // Auth is off server-side: no login screen, no session, nothing to show.
      disabled: authMode === 'disabled',
      // Enough to show the app. True on a cold offline start with a snapshot,
      // which is the whole point.
      canUseApp: authMode === 'disabled' || (!!user && !signedOut),
      // The session is real as far as the server is concerned, this run.
      verified,
      // We are running on an unconfirmed snapshot — worth a quiet note in the
      // UI, not a modal.
      unverified: !!user && !verified && !reachable,
      reachable,
      checking,
      signIn,
      signOut,
      recheck: check,
    }),
    [user, authMode, signedOut, verified, reachable, checking, signIn, signOut, check],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
