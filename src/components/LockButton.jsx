import { useCallback, useEffect, useRef, useState } from 'react'
import { IconLock, IconUnlock } from './Icons.jsx'
import { setLocked } from '../lib/lockMode.js'
import { useLock } from '../lib/useLock.js'

// Toggling takes a deliberate hold, not a tap: this control sits in a header
// full of one-tap buttons, and the whole point of the lock is to survive an
// accidental touch. The ring filling up is the affordance — it tells you the
// press is being counted and how much longer to hold.

const HOLD_MS = 600
const RING_LENGTH = 2 * Math.PI * 13

/** Short pulse on engage, double on release. No-op where unsupported (iOS). */
function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration is a nicety; never let it break the interaction.
  }
}

export default function LockButton() {
  const locked = useLock()
  const [holding, setHolding] = useState(false)
  const [justToggled, setJustToggled] = useState(false)
  const timerRef = useRef(null)
  const keyHeldRef = useRef(false)

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    setHolding(false)
  }, [])

  const complete = useCallback(() => {
    timerRef.current = null
    setHolding(false)
    setLocked(!locked)
    // Two short pulses for "released", one longer for "locked" — the hand
    // knows which way it went without looking.
    buzz(locked ? [18, 45, 18] : 45)
    setJustToggled(true)
  }, [locked])

  const start = useCallback(() => {
    if (timerRef.current) return
    setHolding(true)
    buzz(8)
    timerRef.current = setTimeout(complete, HOLD_MS)
  }, [complete])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (!justToggled) return
    const id = setTimeout(() => setJustToggled(false), 420)
    return () => clearTimeout(id)
  }, [justToggled])

  function handleKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    // Key repeat would otherwise restart the hold forever.
    if (keyHeldRef.current) return
    keyHeldRef.current = true
    start()
  }

  function handleKeyUp(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    keyHeldRef.current = false
    cancel()
  }

  const label = locked
    ? 'Снять блокировку правок — удерживайте'
    : 'Запретить правки — удерживайте'

  return (
    <button
      type="button"
      className={
        'lock-btn' +
        (locked ? ' is-locked' : '') +
        (holding ? ' is-holding' : '') +
        (justToggled ? ' is-toggled' : '')
      }
      aria-label={label}
      aria-pressed={locked}
      title={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      // A long press on touch would otherwise raise the context menu and
      // start a text selection mid-hold.
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="lock-ring" viewBox="0 0 30 30" aria-hidden="true">
        <circle className="lock-ring-track" cx="15" cy="15" r="13" />
        <circle
          className="lock-ring-fill"
          cx="15"
          cy="15"
          r="13"
          style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: RING_LENGTH }}
        />
      </svg>
      <span className="lock-glyph">{locked ? <IconLock /> : <IconUnlock />}</span>
    </button>
  )
}
