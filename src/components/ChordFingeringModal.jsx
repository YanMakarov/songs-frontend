import { useEffect, useRef, useState } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import ChordFretboardEditor from './ChordFretboardEditor.jsx'
import { chordToNotes } from '../lib/chordNotes.js'
import { findFingerings } from '../lib/fretboardSearch.js'

export default function ChordFingeringModal({ chordText, onClose, onCommit }) {
  const modalRef = useRef(null)
  const [fingerings, setFingerings] = useState([])
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    const parsed = chordToNotes(chordText)
    if (parsed) {
      const results = findFingerings(parsed.notes, parsed.bass)
      setFingerings(results)
    } else {
      setFingerings([])
    }
  }, [chordText])

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

  function handleEditorCommit(newChordName) {
    if (onCommit) {
      onCommit(newChordName)
    }
    onClose()
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
            {!showEditor && (
              <button
                className="fingering-modal-tab"
                onClick={() => setShowEditor(true)}
              >
                Редактор
              </button>
            )}
            {showEditor && (
              <button
                className="fingering-modal-tab"
                onClick={() => setShowEditor(false)}
              >
                Аппликатуры
              </button>
            )}
            <button className="fingering-modal-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>
        <div className="fingering-modal-body">
          {showEditor ? (
            <ChordFretboardEditor
              initialValue={chordText}
              onCommit={handleEditorCommit}
              onClose={onClose}
            />
          ) : fingerings.length === 0 ? (
            <div className="fingering-modal-empty">
              Аппликатуры для этого аккорда не найдены
              <button
                className="fingering-modal-editor-link"
                onClick={() => setShowEditor(true)}
              >
                Открыть редактор
              </button>
            </div>
          ) : (
            <div className="fingering-grid">
              {fingerings.map((f, i) => (
                <div key={i} className="fingering-card">
                  <ChordDiagram frets={f.frets} startFret={f.startFret} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
