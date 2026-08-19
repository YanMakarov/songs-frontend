import { useEffect, useRef, useState } from 'react'
import { IconEdit, IconTrash, IconMusic } from './Icons.jsx'
import { chordToNotes } from '../lib/chordNotes.js'
import { hasFingerings } from '../lib/fretboardSearch.js'

// Tiny popover for a chord chip: quick "Edit" / "Delete" / "Fingering" actions, opened via
// right-click (desktop) or a static long-press (touch).
export default function ChordContextMenu({ chordText, anchor, onEdit, onDelete, onFingering, onClose }) {
  const popRef = useRef(null)
  const [pos, setPos] = useState({ top: anchor.y, left: anchor.x })

  const parsed = chordToNotes(chordText)
  const hasFingering = parsed ? hasFingerings(parsed.notes, parsed.bass) : false

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
      <div className="picker-overlay" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="add-line-menu chord-context-menu" ref={popRef} style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="chord-context-menu-title">{chordText}</div>
        <button className="add-line-menu-item compact" onClick={onEdit}>
          <IconEdit />
          <span>Редактировать</span>
        </button>
        {hasFingering && (
          <button className="add-line-menu-item compact" onClick={onFingering}>
            <IconMusic />
            <span>Аппликатура</span>
          </button>
        )}
        <button className="add-line-menu-item compact danger" onClick={onDelete}>
          <IconTrash />
          <span>Удалить</span>
        </button>
      </div>
    </>
  )
}
