import { useRef } from 'react'
import SegmentedControl from './SegmentedControl.jsx'
import { TIME_SIGNATURES } from '../lib/music.js'
import Tooltip from './Tooltip.jsx'

const VIEW_OPTIONS = [
  { value: 'both', label: 'Всё' },
  { value: 'chords', label: 'Аккорды' },
  { value: 'lyrics', label: 'Текст' },
]

const ORIGINAL_KEY_LONG_PRESS_MS = 600

export default function MetaBar({
  song,
  onChange,
  onTranspose,
  viewMode,
  onViewModeChange,
  onRequestOriginalKeyReset,
  onResetOriginalKey,
}) {
  const keyPressTimer = useRef(null)
  const hasOriginalMismatch = Boolean(song.originalKey && song.key && song.originalKey !== song.key)
  const canRequestOriginalReset = hasOriginalMismatch && typeof onRequestOriginalKeyReset === 'function'
  const canResetOriginalKey = hasOriginalMismatch && typeof onResetOriginalKey === 'function'

  function clearKeyPressTimer() {
    if (keyPressTimer.current) {
      clearTimeout(keyPressTimer.current)
      keyPressTimer.current = null
    }
  }

  function handleKeyPointerDown(e) {
    if (!canRequestOriginalReset) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    clearKeyPressTimer()
    keyPressTimer.current = setTimeout(() => {
      keyPressTimer.current = null
      onRequestOriginalKeyReset()
    }, ORIGINAL_KEY_LONG_PRESS_MS)
  }

  function handleKeyPointerEnd() {
    clearKeyPressTimer()
  }

  function handleKeyContextMenu(e) {
    if (!canRequestOriginalReset) return
    e.preventDefault()
    clearKeyPressTimer()
    onRequestOriginalKeyReset()
  }

  function handleOriginalNoteClick() {
    if (!canResetOriginalKey) return
    onResetOriginalKey()
  }

  return (
    <div className="meta-bar">
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
            value={song.key}
            placeholder="C"
            onChange={(e) => onChange({ key: e.target.value })}
          />
        </div>

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
          <Tooltip label="Ниже на полутон">
            <button className="transpose-btn" onClick={() => onTranspose(-1)} aria-label="Ниже на полутон">
              −
            </button>
          </Tooltip>
          <span className="transpose-label">транспон.</span>
          <Tooltip label="Выше на полутон">
            <button className="transpose-btn" onClick={() => onTranspose(1)} aria-label="Выше на полутон">
              +
            </button>
          </Tooltip>
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
