import { useRef } from 'react'
import SegmentedControl from './SegmentedControl.jsx'
import { TIME_SIGNATURES } from '../lib/music.js'
import Tooltip from './Tooltip.jsx'
import { IconEye, IconEyeOff } from './Icons.jsx'
import { useEditableText } from '../lib/useEditableText.js'

const VIEW_OPTIONS = [
  { value: 'both', label: 'Всё' },
  { value: 'chords', label: 'Аккорды' },
  { value: 'lyrics', label: 'Текст' },
]

const INSERT_TOP_LONG_PRESS_MS = 500
const INSERT_TOP_DBL_TAP_MS = 320

export default function MetaBar({
  song,
  onChange,
  onTranspose,
  viewMode,
  onViewModeChange,
  isTransposed,
  originalKey,
  onOpenKeyModal,
  onResetOriginalKey,
  onRequestInsertTop,
  showComments,
  hasComments,
  onToggleComments,
}) {
  const insertPressTimer = useRef(null)
  const insertLongPressFired = useRef(false)
  const insertLastTapAtRef = useRef(0)
  // Only a transposition can put the song beside its original: the key field
  // writes both labels at once. `originalKey` is passed in because `song` here
  // is the transposed copy and no longer knows what the server holds.
  const canResetOriginalKey =
    Boolean(isTransposed) &&
    Boolean(originalKey) &&
    originalKey !== song.key &&
    typeof onResetOriginalKey === 'function'
  const canInsertTop = typeof onRequestInsertTop === 'function'
  // Held locally for the same reason as a comment row: a title fed back from
  // the query cache is rewritten a microtask after the keystroke, which drops
  // the caret at the end of the name.
  const [title, setTitle] = useEditableText(song.title, (next) => onChange({ title: next }))

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
        value={title}
        placeholder="Название песни"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="meta-row">
        {/* A button, not a field: the key may never be blank, so it cannot be
            edited in place — clearing it to type another one is exactly what
            does not work here. The modal edits a draft instead. */}
        {onOpenKeyModal ? (
          <button
            type="button"
            className="meta-field key key-button"
            onClick={onOpenKeyModal}
            aria-label={`Тональность: ${displayKey}. Изменить`}
          >
            <span className="meta-field-label">Тон.</span>
            <span className="meta-field-value">{displayKey}</span>
          </button>
        ) : (
          <div className="meta-field key">
            <span className="meta-field-label">Тон.</span>
            <span className="meta-field-value">{displayKey}</span>
          </div>
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

      {canResetOriginalKey && (
        <button
          type="button"
          className="original-key-note"
          onClick={handleOriginalNoteClick}
          aria-label="Вернуть оригинальную тональность"
        >
          Оригинальная тональность · {originalKey}
        </button>
      )}

      <div className="view-toggle-row">
        <SegmentedControl name="view-mode" options={VIEW_OPTIONS} value={viewMode} onChange={onViewModeChange} />
        {/* Shown only for songs that actually carry notes: a switch for
            something that isn't there is noise. The preference behind it is
            global, so flipping it here decides it for every song. */}
        {hasComments && typeof onToggleComments === 'function' && (
          <button
            type="button"
            className={'comments-toggle' + (showComments ? ' is-on' : '')}
            aria-pressed={showComments}
            onClick={() => onToggleComments(!showComments)}
            title={showComments ? 'Скрыть комментарии во всех песнях' : 'Показать комментарии во всех песнях'}
          >
            {showComments ? <IconEye /> : <IconEyeOff />}
            <span>Комментарии</span>
          </button>
        )}
      </div>
    </div>
  )
}
