import { useEffect } from 'react'
import { IconClose } from './Icons.jsx'

const DEFAULT_MIN = 0.85
const DEFAULT_MAX = 1.4
const DEFAULT_STEP = 0.05

export default function EditorSettingsModal({ open, onClose, textScale, onTextScaleChange, min, max, step }) {
  const sliderMin = Number.isFinite(min) ? min : DEFAULT_MIN
  const sliderMax = Number.isFinite(max) ? max : DEFAULT_MAX
  const sliderStep = Number.isFinite(step) ? step : DEFAULT_STEP
  const applied = Number.isFinite(textScale) ? textScale : 1
  const percent = Math.round(applied * 100)

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

  return (
    <div
      className="settings-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-modal-title" id="editor-settings-title">
            Настройки
          </div>
          <button type="button" className="settings-close-btn" aria-label="Закрыть настройки" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-field">
            <label htmlFor="editor-settings-text-scale">Размер текста</label>
            <div className="text-scale-row">
              <input
                id="editor-settings-text-scale"
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
        </div>
      </div>
    </div>
  )
}
