import { useEffect, useRef, useState } from 'react'
import { detectKey, parseKey } from '../lib/music.js'

// "am" -> "Am", "F#M" -> "F#m", "BBM" -> "Bbm". Only the tonic letter is
// upper case in a key label; everything after it (accidental and the minor
// marker) is lower case, so a single pass over the tail is enough.
function normalizeKeyInput(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
}

// The one place where the tonality is edited. It exists because the meta bar
// cannot host this: the key there may never be empty, so it can neither be
// cleared on the way from Am to C nor left blank long enough for detection to
// have something to fill. Here the field is a draft — empty is a legal
// intermediate state, and closing without saving keeps the previous key.
export default function KeyModal({
  keyLabel,
  chords,
  originalKey,
  onSetAsOriginal,
  onSave,
  onClose,
}) {
  const current = keyLabel || ''
  const [draft, setDraft] = useState(current)
  const [detectNote, setDetectNote] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const normalized = normalizeKeyInput(draft)
  const isValid = parseKey(normalized).valid
  const isDirty = normalized !== current

  function handleDetect() {
    const detected = detectKey(chords || [])
    if (!detected) {
      setDetectNote('Не получилось — в песне не нашлось аккордов.')
      return
    }
    setDraft(detected)
    setDetectNote(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    onSave(normalized)
    onClose?.()
  }

  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <form className="confirm-modal key-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="confirm-modal-title" id="key-modal-title">
          Тональность
        </div>

        <input
          ref={inputRef}
          className="key-modal-input"
          value={draft}
          placeholder="C, Am, F#, Bbm"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value)
            setDetectNote(null)
          }}
        />

        <button type="button" className="key-modal-btn" onClick={handleDetect}>
          Определить по аккордам
        </button>

        {detectNote && <div className="key-modal-note">{detectNote}</div>}
        {!detectNote && draft.trim() && !isValid && (
          <div className="key-modal-note">Не похоже на тональность. Например: C, Am, F#, Bbm.</div>
        )}

        {onSetAsOriginal && (
          <div className="key-modal-original">
            <div className="key-modal-note">Песня транспонирована, оригинал — {originalKey || '—'}.</div>
            <button
              type="button"
              className="key-modal-btn"
              disabled={isDirty}
              onClick={onSetAsOriginal}
            >
              Сделать текущую оригинальной
            </button>
            {isDirty && isValid && (
              <div className="key-modal-note">Сначала сохраните тональность.</div>
            )}
          </div>
        )}

        <div className="confirm-modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="accent-btn" disabled={!isValid}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  )
}
