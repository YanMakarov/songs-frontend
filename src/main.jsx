import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import App from './App.jsx'
import PwaUpdateBanner from './components/PwaUpdateBanner.jsx'
import { persistOptions, queryClient } from './lib/queryClient.js'
import { attachWriteQueue } from './lib/cacheBridge.js'
import './index.css'

// Results of queued song edits have to reach the same cache the UI reads from.
// Attached once, outside React, because the queue outlives every component.
attachWriteQueue(queryClient)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {/* Outside the router: the update prompt is about the shell itself, so
          it must show on every route, including the ones that fail to render. */}
      <PwaUpdateBanner />
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
