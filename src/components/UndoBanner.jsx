import { useEffect, useState } from 'react'

// Floating undo toast with a live countdown. Driven by `expiresAt` (a
// Date.now()-style timestamp) so the parent owns the actual commit timer; this
// component only renders the remaining seconds and fires `onUndo`.
export default function UndoBanner({ message, expiresAt, onUndo }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))

  return (
    <div className="undo-banner" role="status">
      <span className="undo-banner-text">{message}</span>
      <button type="button" onClick={onUndo}>
        Отменить{remaining > 0 ? ` (${remaining})` : ''}
      </button>
    </div>
  )
}