import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often an already-open tab looks for a new build. The app gets opened once
// and left open for a whole rehearsal, so without this check a deploy would
// only be picked up on the next cold start — which might be a week later.
const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Service worker registration plus the two things the user ever needs to know
 * about it: "a new version is ready" and, once, "this now works offline".
 *
 * Nothing here reloads on its own. `updateServiceWorker(true)` — and with it
 * the reload — happens only on a tap, because a reload in the middle of a song
 * or of an unsent edit is worse than running yesterday's build for another hour.
 */
export default function PwaUpdateBanner() {
  const [dismissed, setDismissed] = useState(false)
  const registrationRef = useRef(null)

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      registrationRef.current = registration || null
    },
  })

  // Ask the server whether the shell changed: on a timer, and whenever the tab
  // comes back into view. Same shape as the setlist sync in lib/sync.js —
  // nothing happens while the tab is hidden or the device is offline.
  useEffect(() => {
    const check = () => {
      const registration = registrationRef.current
      if (!registration || !navigator.onLine || document.visibilityState !== 'visible') return
      // Failing is normal on a flaky connection; the next check will do.
      registration.update().catch(() => {})
    }
    const timer = setInterval(check, UPDATE_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // "Работает офлайн" is a one-off confirmation, not a state — it reports that
  // the shell finished caching. It goes away by itself.
  useEffect(() => {
    if (!offlineReady) return undefined
    const id = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (needRefresh && !dismissed) {
    return (
      <div className="pwa-banner" role="status">
        <span className="pwa-banner-text">Есть новая версия</span>
        <button type="button" className="pwa-banner-ghost" onClick={() => setDismissed(true)}>
          Позже
        </button>
        <button type="button" onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="pwa-banner" role="status">
        <span className="pwa-banner-text">Песни доступны без интернета</span>
      </div>
    )
  }

  return null
}
