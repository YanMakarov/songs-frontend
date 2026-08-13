import { useEffect } from 'react'

export default function ConfirmModal({
  title,
  text,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  danger = true,
  onConfirm,
  onClose,
}) {
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

  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <div className="confirm-modal-title">{title}</div>}
        {text && <div className="confirm-modal-text">{text}</div>}
        <div className="confirm-modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'danger-btn' : 'accent-btn'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}