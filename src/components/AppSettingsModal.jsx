import { useEffect, useState } from 'react'
import { IconClose } from './Icons.jsx'
import { getDisplayName, setDisplayName } from '../lib/storage.js'

const DEFAULT_MIN = 0.85
const DEFAULT_MAX = 1.4
const DEFAULT_STEP = 0.05

export default function AppSettingsModal({
  open,
  onClose,
  textScale,
  onTextScaleChange,
  colorScheme,
  onColorSchemeChange,
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

  function handleToggleColorScheme(e) {
    onColorSchemeChange?.(e.target.checked)
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

          <div className="settings-field">
            <label htmlFor="app-settings-display-name">Ваше имя в группе</label>
            <input
              id="app-settings-display-name"
              type="text"
              className="settings-text-input"
              value={name}
              onChange={handleNameChange}
              placeholder="Например, Ян"
              maxLength={60}
              autoComplete="off"
            />
            <div className="settings-hint">
              Подписывает ваши правки, чтобы остальные видели, кто что менял.
            </div>
          </div>

          <div className="settings-field">
            <label htmlFor="app-settings-color-scheme">Цветовая схема аккордов</label>
            <label className="switch-row">
              <input
                id="app-settings-color-scheme"
                type="checkbox"
                checked={Boolean(colorScheme)}
                onChange={handleToggleColorScheme}
              />
              <span className="switch" aria-hidden="true" />
              <span className="switch-label">Окрашивать аккорды по тональности</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
