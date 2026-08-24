import { useEffect, useState } from 'react'
import { IconClose } from './Icons.jsx'
import InstallSection from './InstallSection.jsx'
import SegmentedControl from './SegmentedControl.jsx'
import { CHORD_STYLES, getDisplayName, setDisplayName } from '../lib/storage.js'
import { useAuth } from '../lib/auth.jsx'

const CHORD_STYLE_OPTIONS = [
  { value: 'chip', label: 'Обычные' },
  { value: 'color', label: 'Цветные' },
  { value: 'plain', label: 'Как в PDF' },
]

const CHORD_STYLE_HINTS = {
  chip: 'Аккорды выделены плашкой в акцентном цвете.',
  color: 'Каждая ступень окрашена своим цветом.',
  plain: 'Моноширинный текст без выделения — как на распечатке.',
}

const DEFAULT_MIN = 0.85
const DEFAULT_MAX = 1.4
const DEFAULT_STEP = 0.05

export default function AppSettingsModal({
  open,
  onClose,
  textScale,
  onTextScaleChange,
  chordStyle,
  onChordStyleChange,
  min,
  max,
  step,
}) {
  const sliderMin = Number.isFinite(min) ? min : DEFAULT_MIN
  const sliderMax = Number.isFinite(max) ? max : DEFAULT_MAX
  const sliderStep = Number.isFinite(step) ? step : DEFAULT_STEP
  const applied = Number.isFinite(textScale) ? textScale : 1
  const percent = Math.round(applied * 100)
  const [name, setName] = useState(getDisplayName)
  const { user, signOut } = useAuth()

  // Re-read on open: another tab may have changed it.
  useEffect(() => {
    if (open) setName(getDisplayName())
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  function clamp(value) {
    return Math.min(Math.max(value, sliderMin), sliderMax)
  }

  function handleSliderChange(e) {
    if (!onTextScaleChange) return
    const next = Number(e.target.value)
    if (!Number.isFinite(next)) return
    onTextScaleChange(clamp(next))
  }

  async function handleSignOut() {
    // Wording matters: the cache really is emptied, and on a phone that means
    // re-downloading the setlist over whatever connection is available.
    if (!window.confirm('Выйти? Песни, сохранённые на этом устройстве, будут удалены.')) return
    onClose?.()
    await signOut()
  }

  function handleNameChange(e) {
    const next = e.target.value
    setName(next)
    setDisplayName(next)
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-modal-title" id="app-settings-title">
            Настройки приложения
          </div>
          <button type="button" className="settings-close-btn" aria-label="Закрыть настройки" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-field">
            <label htmlFor="app-settings-text-scale">Размер текста</label>
            <div className="text-scale-row">
              <input
                id="app-settings-text-scale"
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={applied}
                onChange={handleSliderChange}
                aria-label="Размер текста"
                aria-valuemin={sliderMin}
                aria-valuemax={sliderMax}
                aria-valuenow={applied}
              />
              <span className="text-scale-value">{percent}%</span>
            </div>
          </div>

          {/* Signed in, the name is the account's and not the browser's —
              editing it here would change nothing the server records. The
              free-text field survives only for a backend running with auth
              disabled, where there is no account to take it from. */}
          {user ? (
            <div className="settings-field">
              <label>Вы вошли как</label>
              <div className="settings-account">
                <div className="settings-account-name">{user.displayName}</div>
                <div className="settings-account-login">{user.username}</div>
              </div>
              <button type="button" className="settings-signout-btn" onClick={handleSignOut}>
                Выйти
              </button>
              <div className="settings-hint">
                Выход очистит песни, сохранённые на этом устройстве.
              </div>
            </div>
          ) : (
            <div className="settings-field">
              <label htmlFor="app-settings-display-name">Ваше имя в группе</label>
              <input
                id="app-settings-display-name"
                type="text"
                className="settings-text-input"
                value={name}
                onChange={handleNameChange}
                placeholder="Например, Иннокентий"
                maxLength={60}
                autoComplete="off"
              />
              <div className="settings-hint">
                Подписывает ваши правки, чтобы остальные видели, кто что менял.
              </div>
            </div>
          )}

          <InstallSection />

          <div className="settings-field">
            <label>Вид аккордов</label>
            <SegmentedControl
              name="Вид аккордов"
              value={CHORD_STYLES.includes(chordStyle) ? chordStyle : 'chip'}
              onChange={(next) => onChordStyleChange?.(next)}
              options={CHORD_STYLE_OPTIONS}
            />
            <div className="settings-hint">{CHORD_STYLE_HINTS[chordStyle] || CHORD_STYLE_HINTS.chip}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
