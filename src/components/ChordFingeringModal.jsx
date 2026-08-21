import { useEffect, useMemo, useRef, useState } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import { chordToNotes, getQualityIntervals } from '../lib/chordNotes.js'
import { computeStartFret, detectBarre, encodeVoicing } from '../lib/voicing.js'
import { matchShape } from '../lib/shapeMatch.js'
import { listMovableShapes } from '../lib/api.js'

// Read-only picker over the shared movable-shape library for this exact
// chord — no renaming and no freehand fretboard here. Shapes that don't
// produce this chord at all are left out entirely (unlike the library page,
// which shows everything so you can compare); only what's actually playable
// shows up as an option.
export default function ChordFingeringModal({ chordText, selectedVoicing, onClose, onSelectVoicing, onDeselectVoicing, onOpenLibrary }) {
  const modalRef = useRef(null)
  const [allShapes, setAllShapes] = useState([])
  const [loading, setLoading] = useState(true)

  const parsedChord = useMemo(() => chordToNotes(chordText), [chordText])

  useEffect(() => {
    let ignore = false
    listMovableShapes()
      .then((rows) => {
        if (!ignore) setAllShapes(rows)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const matches = useMemo(() => {
    if (!parsedChord) return []
    const qualityIntervals = getQualityIntervals(parsedChord.quality)
    if (!qualityIntervals) return []
    return allShapes
      .map((shape) => {
        const result = matchShape(shape, parsedChord.root, qualityIntervals, parsedChord.bass)
        return { shape, ...result }
      })
      .filter((m) => m.fullMatch)
  }, [allShapes, parsedChord])

  function handleCardClick(frets) {
    const code = encodeVoicing(frets)
    if (selectedVoicing === code) {
      onDeselectVoicing && onDeselectVoicing()
    } else {
      onSelectVoicing && onSelectVoicing(code)
    }
  }

  return (
    <div
      className="fingering-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Аппликатуры аккорда ${chordText}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="fingering-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="fingering-modal-header">
          <span className="fingering-modal-title">{chordText}</span>
          <div className="fingering-modal-header-actions">
            <button className="fingering-modal-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>
        <div className="fingering-modal-body">
          {loading ? null : matches.length === 0 ? (
            <div className="fingering-modal-empty">
              Ни одна форма из библиотеки не подходит к «{chordText}»
              <button
                className="fingering-modal-editor-link"
                onClick={() => onOpenLibrary && onOpenLibrary(chordText)}
              >
                Открыть библиотеку
              </button>
            </div>
          ) : (
            <>
              <div className="fingering-grid">
                {matches.map(({ shape, frets }) => {
                  const code = encodeVoicing(frets)
                  const isSelected = selectedVoicing === code
                  return (
                    <button
                      key={shape.id}
                      type="button"
                      className={`fingering-card${isSelected ? ' selected' : ''}`}
                      onClick={() => handleCardClick(frets)}
                    >
                      <ChordDiagram
                        frets={frets}
                        startFret={computeStartFret(frets)}
                        barre={detectBarre(frets)}
                        root={parsedChord?.root}
                      />
                      <span className="fingering-card-label">
                        {isSelected ? 'Используется здесь' : shape.name || ''}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                className="fingering-modal-editor-link"
                onClick={() => onOpenLibrary && onOpenLibrary(chordText)}
              >
                Управлять в библиотеке
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
