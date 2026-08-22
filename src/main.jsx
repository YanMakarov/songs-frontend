import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import AuthGate from './components/AuthGate.jsx'
import PwaUpdateBanner from './components/PwaUpdateBanner.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { applyTheme } from './lib/theme.js'
import { loadTheme } from './lib/storage.js'
import { persistOptions, queryClient } from './lib/queryClient.js'
import { attachWriteQueue } from './lib/cacheBridge.js'
import { isStandalone, requestPersistentStorage } from './lib/install.js'
import './index.css'

// Design tokens live under [data-theme], so until the attribute is set every
// var() in the stylesheet resolves to nothing — no card background, no field
// border, no button fill. App.jsx applies the theme in an effect, but the
// sign-in screen renders instead of <App>, so on a cold start while signed out
// nothing ever set it. Doing it here covers every screen and also removes the
// unstyled first paint on the signed-in path.
applyTheme(loadTheme())

// Results of queued song edits have to reach the same cache the UI reads from.
// Attached once, outside React, because the queue outlives every component.
attachWriteQueue(queryClient)

// Launched from a home screen icon: the user already committed to keeping the
// app, so ask the browser to stop treating the song cache as disposable. Only
// here — in a tab this would be asking on behalf of someone who has not
// decided anything yet. Imported for its side effect too: the module has to be
// loaded before `beforeinstallprompt` fires, and that happens early.
if (isStandalone()) requestPersistentStorage()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {/* Outside the router because signing in is not a route: there is no
          URL that shows the login screen, and none that skips it. Inside the
          query provider because signing out has to be able to empty the
          cache. */}
      <AuthProvider>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </AuthProvider>
      {/* Outside the router: the update prompt is about the shell itself, so
          it must show on every route, including the ones that fail to render. */}
      <PwaUpdateBanner />
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
