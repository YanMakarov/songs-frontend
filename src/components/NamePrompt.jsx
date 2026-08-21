import { useEffect, useState } from 'react'
import { getDisplayName, setDisplayName } from '../lib/storage.js'

// Asked once per browser, and only because the answer is useful to other
// people: without it every edit this browser makes is attributed to
// "anon-3f7a1c", and a conflict banner can only say "кто-то". Dismissible,
// and never asked again — the field lives in settings for whenever they
// change their mind.

const DISMISSED_KEY = 'chords_app_name_prompt_dismissed_v1'

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return true
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Nothing to do; worst case the prompt appears once more.
  }
}

export default function NamePrompt() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (getDisplayName() || wasDismissed()) return
    // Let the app paint first — greeting someone with a dialog before their
    // songs appear is a poor first impression.
    const id = setTimeout(() => setOpen(true), 700)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  function dismiss() {
    markDismissed()
    setOpen(false)
  }

  function save(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return dismiss()
    setDisplayName(trimmed)
    markDismissed()
    setOpen(false)
  }

  return (
    <div className="settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="name-prompt-title">
      <form className="settings-modal name-prompt" onSubmit={save}>
        <div className="settings-modal-header">
          <div className="settings-modal-title" id="name-prompt-title">
            Как вас зовут?
          </div>
        </div>
        <p className="settings-hint">
          Имя подписывает ваши правки, чтобы остальные видели, кто что менял.
          Его видно только участникам сетлиста, и поменять можно в настройках.
        </p>
        <input
          className="settings-text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Ян"
          maxLength={60}
          autoComplete="off"
          autoFocus
        />
        <div className="name-prompt-actions">
          <button type="button" className="ghost-btn" onClick={dismiss}>
            Позже
          </button>
          <button type="submit" className="accent-btn" disabled={!name.trim()}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  )
}
