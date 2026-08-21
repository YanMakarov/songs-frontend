// Installing the app on a home screen, and keeping its offline data there.
//
// Two things browsers only offer once and only in the right moment:
//
// 1. `beforeinstallprompt` fires once per page load, early — usually before
//    React has mounted. Miss it and there is no way to ask for it again, so it
//    is captured here at module load and replayed to whatever renders later.
// 2. Persistent storage. Without it the browser is free to evict IndexedDB
//    when the phone runs low on space — which is exactly the cache the app
//    reads from when there is no signal.
//
// Safari implements neither: there is no install event on iOS (the user goes
// through «Поделиться» → «На экран „Домой“»), which is why `platform` exists.

import { useEffect, useState } from 'react'

const PERSIST_ASKED_KEY = 'chords_app_storage_persist_asked_v1'

let deferredPrompt = null
let installed = false
const listeners = new Set()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppressing the browser's own mini-infobar is the price of showing the
    // button where it belongs — in settings, next to everything else offline.
    event.preventDefault()
    deferredPrompt = event
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    // The user just committed to keeping the app around; that is the moment
    // where asking to keep its data around too costs nothing.
    requestPersistentStorage()
    emit()
  })
}

/** Running from a home screen icon rather than a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  // `standalone` is Safari's own flag and the only one iOS sets.
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // An iPad on iPadOS 13+ claims to be a Mac; the touch points give it away.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/**
 * Ask the browser not to evict our IndexedDB when storage runs short.
 *
 * The two engines answer this question differently, and that difference is
 * the whole shape of this function. Chromium decides silently from engagement
 * and installed state, so asking again on a later launch is free and may well
 * succeed where the first one did not. Firefox turns the same call into a
 * permission dialog — and a dialog nobody asked for is worse than an evictable
 * cache, so there we ask exactly once, ever.
 */
export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
  try {
    if (await navigator.storage.persisted()) return true
    // `userAgentData` is Chromium-only, which is precisely the question here:
    // will this call put a dialog in front of the user?
    const decidesSilently = Boolean(navigator.userAgentData)
    if (!decidesSilently) {
      if (localStorage.getItem(PERSIST_ASKED_KEY)) return false
      localStorage.setItem(PERSIST_ASKED_KEY, '1')
    }
    return await navigator.storage.persist()
  } catch {
    // Private mode and some embedded browsers throw here. Nothing to do about
    // it, and nothing that should stop the app from starting.
    return null
  }
}

/**
 * Everything the settings UI needs to say the right thing on every platform:
 * whether we can show a real install button, whether the app is already
 * installed, and which manual path to describe when it is neither.
 */
export function useInstallState() {
  const [state, setState] = useState(() => ({
    canPrompt: deferredPrompt !== null,
    installed: installed || isStandalone(),
  }))

  useEffect(() => {
    const update = () => {
      setState({ canPrompt: deferredPrompt !== null, installed: installed || isStandalone() })
    }
    listeners.add(update)
    update()
    return () => listeners.delete(update)
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return 'unavailable'
    const event = deferredPrompt
    // Whatever the user answers, the event cannot be reused.
    deferredPrompt = null
    emit()
    event.prompt()
    const { outcome } = await event.userChoice
    return outcome // 'accepted' | 'dismissed'
  }

  return { ...state, platform: detectPlatform(), promptInstall }
}
