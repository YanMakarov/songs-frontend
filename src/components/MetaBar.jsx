import { useRef, useState, useEffect } from 'react'
import SegmentedControl from './SegmentedControl.jsx'
import { TIME_SIGNATURES } from '../lib/music.js'
import Tooltip from './Tooltip.jsx'

const VIEW_OPTIONS = [
  { value: 'both', label: 'Всё' },
  { value: 'chords', label: 'Аккорды' },
  { value: 'lyrics', label: 'Текст' },
]

const ORIGINAL_KEY_LONG_PRESS_MS = 600
const INSERT_TOP_LONG_PRESS_MS = 500
const INSERT_TOP_DBL_TAP_MS = 320

// Extract all chords from song lines for key detection
function extractAllChords(song) {
  const chords = []
  if (Array.isArray(song.lines)) {
    for (const line of song.lines) {
      if (Array.isArray(line.chords)) {
        for (const chordObj of line.chords) {
          if (chordObj.chord && typeof chordObj.chord === 'string') {
            chords.push(chordObj.chord)
          }
        }
      }
    }
  }
  return chords
}

export default function MetaBar({
  song,
  onChange,
  onTranspose,
  viewMode,
  onViewModeChange,
  isTransposed,
  onRequestOriginalKeyReset,
  onResetOriginalKey,
  onRequestInsertTop,
  onDetectKey, // New prop for key detection callback
}) {
  const keyPressTimer = useRef(null)
  const insertPressTimer = useRef(null)
  const insertLongPressFired = useRef(false)
  const insertLastTapAtRef = useRef(0)
  const hasOriginalMismatch = Boolean(song.originalKey && song.key && song.originalKey !== song.key)
  const canRequestOriginalReset = Boolean(isTransposed) && typeof onRequestOriginalKeyReset === 'function'
  const canResetOriginalKey = hasOriginalMismatch && typeof onResetOriginalKey === 'function'
  const canInsertTop = typeof onRequestInsertTop === 'function'
  
  // Check if we should show detect key button
  const [showDetectKey, setShowDetectKey] = useState(false)
  const hasChords = extractAllChords(song).length > 0
  const hasNoKey = !song.key || song.key.trim() === ''
  
  useEffect(() => {
    // Show detect key button when there are chords but no key set
    setShowDetectKey(hasChords && hasNoKey)
  }, [hasChords, hasNoKey])

  function clearKeyPressTimer() {
    if (keyPressTimer.current) {
      clearTimeout(keyPressTimer.current)
      keyPressTimer.current = null
    }
  }

  function handleKeyPointerDown(e) {
    if (!canRequestOriginalReset) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    clearKeyPressTimer()
    keyPressTimer.current = setTimeout(() => {
      keyPressTimer.current = null
      onRequestOriginalKeyReset()
    }, ORIGINAL_KEY_LONG_PRESS_MS)
  }

  function handleKeyPointerEnd(e) {
    if (!canRequestOriginalReset) return
    e.stopPropagation()
    clearKeyPressTimer()
  }

  function handleKeyContextMenu(e) {
    if (!canRequestOriginalReset) return
    e.preventDefault()
    e.stopPropagation()
    clearKeyPressTimer()
    onRequestOriginalKeyReset()
  }

  function handleOriginalNoteClick() {
    if (!canResetOriginalKey) return
    onResetOriginalKey()
  }

  function clearInsertTimer() {
    if (insertPressTimer.current) {
      clearTimeout(insertPressTimer.current)
      insertPressTimer.current = null
    }
  }

  function handleInsertPointerDown(e) {
    if (!canInsertTop) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    insertLongPressFired.current = false
    if (e.pointerType === 'touch') return
    clearInsertTimer()
    insertPressTimer.current = setTimeout(() => {
      insertPressTimer.current = null
      insertLongPressFired.current = true
      onRequestInsertTop(e.clientX, e.clientY)
    }, INSERT_TOP_LONG_PRESS_MS)
  }

  function handleInsertPointerUp(e) {
    clearInsertTimer()
    if (!canInsertTop) return
    if (e.pointerType !== 'touch') return
    const now = Date.now()
    if (now - insertLastTapAtRef.current < INSERT_TOP_DBL_TAP_MS) {
      insertLastTapAtRef.current = 0
      insertLongPressFired.current = true
      onRequestInsertTop(e.clientX, e.clientY)
    } else {
      insertLastTapAtRef.current = now
    }
  }

  function handleInsertPointerEnd() {
    clearInsertTimer()
  }

  function handleInsertDoubleClick(e) {
    if (!canInsertTop) return
    if (insertLongPressFired.current) {
      insertLongPressFired.current = false
      return
    }
    clearInsertTimer()
    onRequestInsertTop(e.clientX, e.clientY)
  }

  function handleInsertContextMenu(e) {
    if (!canInsertTop) return
    e.preventDefault()
    clearInsertTimer()
    onRequestInsertTop(e.clientX, e.clientY)
  }

  function handleInsertClickCapture(e) {
    if (insertLongPressFired.current) {
      insertLongPressFired.current = false
      e.stopPropagation()
    }
  }

  // Handle key detection
  function handleDetectKey() {
    if (typeof onDetectKey === 'function') {
      onDetectKey()
    }
  }

  // Display key or placeholder
  const displayKey = song.key || '?'

  return (
    <div
      className="meta-bar"
      onClickCapture={canInsertTop ? handleInsertClickCapture : undefined}
      onPointerDown={canInsertTop ? handleInsertPointerDown : undefined}
      onPointerUp={canInsertTop ? handleInsertPointerUp : undefined}
      onPointerLeave={canInsertTop ? handleInsertPointerEnd : undefined}
      onPointerCancel={canInsertTop ? handleInsertPointerEnd : undefined}
      onDoubleClick={canInsertTop ? handleInsertDoubleClick : undefined}
      onContextMenu={canInsertTop ? handleInsertContextMenu : undefined}
    >
      <input
        className="title-input"
        value={song.title}
        placeholder="Название песни"
        onChange={(e) => onChange({ title: e.target.value })}
      />

      <div className="meta-row">
        <div
          className="meta-field key"
          onPointerDown={handleKeyPointerDown}
          onPointerUp={handleKeyPointerEnd}
          onPointerLeave={handleKeyPointerEnd}
          onPointerCancel={handleKeyPointerEnd}
          onContextMenu={handleKeyContextMenu}
        >
          <label>Тон.</label>
          <input
            value={displayKey}
            placeholder="?"
            onChange={(e) => {
              const newValue = e.target.value
              // If user types "?" or clears the field, store as empty string
              onChange({ key: newValue === '?' ? '' : newValue })
            }}
          />
        </div>

        {showDetectKey && (
          <button
            type="button"
            className="detect-key-btn"
            onClick={handleDetectKey}
            aria-label="Определить тональность"
          >
            Определить тональность
          </button>
        )}

        <div className="meta-field">
          <label>BPM</label>
          <input
            type="number"
            inputMode="numeric"
            value={song.bpm ?? ''}
            placeholder="—"
            onChange={(e) => onChange({ bpm: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>

        <div className="meta-field time">
          <label>Размер</label>
          <select value={song.timeSignature} onChange={(e) => onChange({ timeSignature: e.target.value })}>
            {TIME_SIGNATURES.map((ts) => (
              <option key={ts} value={ts}>{ts}</option>
            ))}
          </select>
        </div>

        <div className="transpose-group">
          <button className="transpose-btn" onClick={() => onTranspose(-1)} aria-label="Ниже на полутон">
            −
          </button>
          <span className="transpose-label">транспон.</span>
          <button className="transpose-btn" onClick={() => onTranspose(1)} aria-label="Выше на полутон">
            +
          </button>
        </div>
      </div>

      {hasOriginalMismatch && (
        <button
          type="button"
          className="original-key-note"
          onClick={handleOriginalNoteClick}
          aria-label="Вернуть оригинальную тональность"
        >
          Оригинальная тональность · {song.originalKey}
        </button>
      )}

      <div className="view-toggle-row">
        <SegmentedControl name="view-mode" options={VIEW_OPTIONS} value={viewMode} onChange={onViewModeChange} />
      </div>
    </div>
  )
}
