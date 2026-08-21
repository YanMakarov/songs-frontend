import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { diatonicChords, fullChordCatalogue, parseKey } from '../lib/music.js'
import { IconTrash } from './Icons.jsx'
import Tooltip from './Tooltip.jsx'
import ChordFretboardEditor from './ChordFretboardEditor.jsx'

// Floating popover: pick a chord from key-diatonic suggestions, the full
// catalogue, type any free-form chord text, or (if the name isn't known)
// switch to the neck and tap it out — matched against the shared shape
// library, or added to it under whatever name is confirmed.
export default function ChordPicker({ songKey, initialValue, initialVoicing, canDelete, anchor, onCommit, onDelete, onClose }) {
  const [query, setQuery] = useState(initialValue || '')
  const [showNeck, setShowNeck] = useState(false)
  const inputRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState({ top: anchor.y, left: anchor.x })

  useEffect(() => {
    if (!showNeck) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [showNeck])

  useLayoutEffect(() => {
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
  }, [anchor, showNeck])

  const { preferFlat } = parseKey(songKey)
  const diatonic = useMemo(() => diatonicChords(songKey), [songKey])
  const catalogue = useMemo(() => fullChordCatalogue(preferFlat), [preferFlat])

  const q = query.trim().toLowerCase()
  const filteredDiatonic = diatonic.filter((c) => !q || c.toLowerCase().startsWith(q))
  const filteredOther = catalogue.filter(
    (c) => (!q || c.toLowerCase().startsWith(q)) && !diatonic.includes(c),
  ).slice(0, 60)

  function commit(chord) {
    const val = (chord ?? query).trim()
    if (!val) return
    onCommit(val)
  }

  function handleNeckCommit({ name, frets }) {
    onCommit(name, frets)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <>
      <div className="picker-overlay" onMouseDown={onClose} />
      <div
        className="chord-picker"
        ref={popRef}
        style={{ top: pos.top, left: pos.left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showNeck ? (
          <>
            <div className="chord-picker-neck-header">
              <button className="chord-picker-neck-back" onClick={() => setShowNeck(false)}>
                ← Список
              </button>
            </div>
            <ChordFretboardEditor
              initialValue={query}
              initialFrets={initialVoicing || null}
              onCommit={handleNeckCommit}
              onClose={onClose}
            />
          </>
        ) : (
          <>
            <div className="chord-picker-input-row">
              <input
                ref={inputRef}
                value={query}
                placeholder="Аккорд, напр. Am7"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <Tooltip label="Не знаю название — натыкать на грифе">
                <button className="chord-picker-neck-btn" onClick={() => setShowNeck(true)} aria-label="Открыть гриф">
                  Гриф
                </button>
              </Tooltip>
              {canDelete && (
                <Tooltip label="Удалить аккорд">
                  <button className="chord-picker-delete" onClick={onDelete} aria-label="Удалить аккорд">
                    <IconTrash />
                  </button>
                </Tooltip>
              )}
            </div>
            <div className="chord-picker-list">
              {filteredDiatonic.length > 0 && (
                <>
                  <div className="chord-picker-group-label">Из тональности {songKey}</div>
                  {filteredDiatonic.map((c) => (
                    <button key={'d' + c} className="chord-picker-item" onClick={() => commit(c)}>
                      {c}
                    </button>
                  ))}
                </>
              )}
              {filteredOther.length > 0 && (
                <>
                  <div className="chord-picker-group-label">Другие аккорды</div>
                  {filteredOther.map((c) => (
                    <button key={'o' + c} className="chord-picker-item" onClick={() => commit(c)}>
                      {c}
                    </button>
                  ))}
                </>
              )}
              {filteredDiatonic.length === 0 && filteredOther.length === 0 && (
                <div className="chord-picker-empty">
                  {q ? `Нажмите Enter, чтобы использовать «${query.trim()}»` : 'Введите аккорд'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
