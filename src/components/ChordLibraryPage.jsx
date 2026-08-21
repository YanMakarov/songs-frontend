import { useEffect, useMemo, useState } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import ShapeEditor from './ShapeEditor.jsx'
import { chordToNotes, getAllQualities, getQualityIntervals, NOTE_NAMES } from '../lib/chordNotes.js'
import { noteToSemitone } from '../lib/music.js'
import { matchShape } from '../lib/shapeMatch.js'
import { computeStartFret, detectBarre } from '../lib/voicing.js'
import { createMovableShape, deleteMovableShape, listMovableShapes } from '../lib/api.js'
import { IconChevronLeft, IconClose, IconPlus } from './Icons.jsx'

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// Common qualities first (matches how they're actually used), then whatever
// else chordNotes.js knows about so nothing is unreachable.
const QUALITY_PRIORITY = [
  '', 'm', '7', 'm7', 'maj7', 'maj9', '9', 'm9', 'sus2', 'sus4', '5',
  '7b5', 'm7b5', 'dim', 'dim7', '6', 'm6', 'aug', '69', 'add9',
]
const QUALITIES = [...QUALITY_PRIORITY, ...getAllQualities().filter((q) => !QUALITY_PRIORITY.includes(q))]

function qualityLabel(q) {
  return q === '' ? 'maj' : q
}

function semitoneToLetterAccidental(semitone) {
  const name = NOTE_NAMES[((semitone % 12) + 12) % 12]
  return { letter: name[0], accidental: name.slice(1) }
}

// Compact root/bass picker: a letter row plus a separate #/b toggle, instead
// of 12 individual note buttons.
function NoteTagPicker({ letter, accidental, onChange, allowNone, noneActive, onNone }) {
  return (
    <div className="chord-library-tag-picker">
      <div className="chord-library-tag-row">
        {allowNone && (
          <button
            type="button"
            className={`chord-library-tag${noneActive ? ' active' : ''}`}
            onClick={onNone}
          >
            нет
          </button>
        )}
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            className={`chord-library-tag${!noneActive && letter === l ? ' active' : ''}`}
            onClick={() => onChange(l, accidental)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="chord-library-tag-row">
        {['#', 'b'].map((acc) => (
          <button
            key={acc}
            type="button"
            className={`chord-library-tag${!noneActive && accidental === acc ? ' active' : ''}`}
            onClick={() => onChange(letter, accidental === acc ? '' : acc)}
          >
            {acc}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ChordLibraryPage({ onBack, initialChord }) {
  const [shapes, setShapes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const [rootLetter, setRootLetter] = useState('C')
  const [rootAccidental, setRootAccidental] = useState('')
  const [quality, setQuality] = useState('')
  const [bassLetter, setBassLetter] = useState('C')
  const [bassAccidental, setBassAccidental] = useState('')
  const [hasBass, setHasBass] = useState(false)

  function reload() {
    setLoading(true)
    listMovableShapes()
      .then(setShapes)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  // Deep link from a song's fingering modal ("Управлять в библиотеке") —
  // prefill the form instead of just landing on the default C major.
  useEffect(() => {
    if (!initialChord) return
    const parsed = chordToNotes(initialChord)
    if (!parsed) return
    const rootLA = semitoneToLetterAccidental(parsed.root)
    setRootLetter(rootLA.letter)
    setRootAccidental(rootLA.accidental)
    setQuality(parsed.quality)
    if (parsed.bass !== null && parsed.bass !== parsed.root) {
      const bassLA = semitoneToLetterAccidental(parsed.bass)
      setHasBass(true)
      setBassLetter(bassLA.letter)
      setBassAccidental(bassLA.accidental)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChord])

  const root = useMemo(() => noteToSemitone(rootLetter + rootAccidental), [rootLetter, rootAccidental])
  const bass = useMemo(
    () => (hasBass ? noteToSemitone(bassLetter + bassAccidental) : null),
    [hasBass, bassLetter, bassAccidental],
  )
  const chordName = `${rootLetter}${rootAccidental}${quality}${hasBass ? `/${bassLetter}${bassAccidental}` : ''}`
  const qualityIntervals = getQualityIntervals(quality) || [0, 4, 7]

  const results = useMemo(() => {
    return shapes
      .map((shape) => ({ shape, ...matchShape(shape, root, qualityIntervals, bass) }))
      .filter((r) => r.fullMatch)
  }, [shapes, root, qualityIntervals, bass])

  async function handleDelete(e, shapeId) {
    e.stopPropagation()
    await deleteMovableShape(shapeId)
    reload()
  }

  async function handleAddCommit(payload) {
    await createMovableShape({ ...payload, isCustom: true })
    setShowAdd(false)
    reload()
  }

  return (
    <div className="chord-library-page">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <IconChevronLeft />
        </button>
        <div className="topbar-title">Библиотека форм</div>
      </div>

      <div className="chord-library-body">
        <div className="chord-library-list-pane">
          <div className="chord-library-form-label">Тональность</div>
          <NoteTagPicker
            letter={rootLetter}
            accidental={rootAccidental}
            onChange={(l, a) => {
              setRootLetter(l)
              setRootAccidental(a)
            }}
          />

          <div className="chord-library-form-label">Аккорд</div>
          <div className="chord-library-tag-row chord-library-tag-row--wrap">
            {QUALITIES.map((q) => (
              <button
                key={q || 'maj'}
                type="button"
                className={`chord-library-tag${quality === q ? ' active' : ''}`}
                onClick={() => setQuality(q)}
              >
                {qualityLabel(q)}
              </button>
            ))}
          </div>

          <div className="chord-library-form-label">Бас</div>
          <NoteTagPicker
            letter={bassLetter}
            accidental={bassAccidental}
            allowNone
            noneActive={!hasBass}
            onNone={() => setHasBass(false)}
            onChange={(l, a) => {
              setHasBass(true)
              setBassLetter(l)
              setBassAccidental(a)
            }}
          />
        </div>

        <div className="chord-library-detail-pane">
          <div className="chord-library-detail-header">
            {chordName}
            <button type="button" className="chord-library-add-btn" onClick={() => setShowAdd(true)}>
              <IconPlus /> Добавить форму
            </button>
          </div>
          {loading ? (
            <div className="chord-library-hint">Загрузка…</div>
          ) : shapes.length === 0 ? (
            <div className="chord-library-hint">В библиотеке пока нет форм — добавьте первую</div>
          ) : results.length === 0 ? (
            <div className="chord-library-hint">Ни одна форма не подходит к «{chordName}» — добавьте новую</div>
          ) : (
            <div className="fingering-grid">
              {results.map(({ shape, frets }) => (
                <div key={shape.id} className="fingering-card chord-library-card">
                  <button type="button" className="fingering-card-delete" aria-label="Удалить форму" onClick={(e) => handleDelete(e, shape.id)}>
                    <IconClose />
                  </button>
                  <ChordDiagram
                    frets={frets}
                    startFret={computeStartFret(frets)}
                    barre={detectBarre(frets)}
                    root={root}
                  />
                  <span className="fingering-card-label">{shape.name || (shape.rootString === 0 ? 'E-форма' : shape.rootString === 1 ? 'A-форма' : '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fingering-modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="fingering-modal shape-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fingering-modal-header">
              <span className="fingering-modal-title">Новая форма</span>
              <button className="fingering-modal-close" onClick={() => setShowAdd(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="fingering-modal-body">
              <ShapeEditor onCommit={handleAddCommit} onClose={() => setShowAdd(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
