import { useEffect, useRef, useState } from 'react'
import { IconTextLine, IconSection, IconMusic } from './Icons.jsx'

// Small popover shown whenever the user adds a new line: choose between a
// regular text+chords line, or a structural section label (Verse, Chorus...).
export default function AddLineMenu({ anchor, contextLabel, onChoose, onClose }) {
  const popRef = useRef(null)
  const [pos, setPos] = useState({ top: anchor.y, left: anchor.x })

  useEffect(() => {
    const el = popRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 10
    let left = anchor.x
    let top = anchor.y
    if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin
    if (left < margin) left = margin
    if (top + rect.height + margin > window.innerHeight) top = anchor.y - rect.height - 10
    if (top < margin) top = margin
    setPos({ top, left })
  }, [anchor])

  return (
    <>
      <div className="picker-overlay" onMouseDown={onClose} />
      <div className="add-line-menu" ref={popRef} style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
        {contextLabel && <div className="add-line-menu-context">{contextLabel}</div>}
        <button className="add-line-menu-item" onClick={() => onChoose('line')}>
          <IconTextLine />
          <span>
            Строка
            <small>Текст + аккорды</small>
          </span>
        </button>
        <button className="add-line-menu-item" onClick={() => onChoose('section')}>
          <IconSection />
          <span>
            Раздел
            <small>Куплет, Припев…</small>
          </span>
        </button>
        <button className="add-line-menu-item" onClick={() => onChoose('chords')}>
          <IconMusic />
          <span>
            Проигрыш
            <small>Только аккорды, без текста</small>
          </span>
        </button>
      </div>
    </>
  )
}
