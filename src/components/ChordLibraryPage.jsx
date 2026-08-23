import { useEffect, useMemo, useRef, useState } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import ShapeEditor from './ShapeEditor.jsx'
import { chordToNotes, getAllQualities, getQualityIntervals, NOTE_NAMES } from '../lib/chordNotes.js'
import { noteToSemitone } from '../lib/music.js'
import { matchShape } from '../lib/shapeMatch.js'
import { computeStartFret, detectBarre } from '../lib/voicing.js'
import {
  createMovableShape,
  deleteMovableShape,
  listMovableShapes,
  renameMovableShape,
} from '../lib/api.js'
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
          -
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

// What a shape is called when it was saved without a name. Always some text,
// never an empty string — the label doubles as the target you click to rename,
// and there's nothing to aim at if it renders as nothing.
function fallbackLabel(shape) {
  if (shape.rootString === 0) return 'E-форма'
  if (shape.rootString === 1) return 'A-форма'
  return 'Без названия'
}

function ShapeCard({ shape, frets, root, note, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Enter commits and unmounts the input; Escape unmounts it too. Either way
  // the blur that follows must not fire a second save (or undo the cancel).
  const settledRef = useRef(false)

  function startEditing() {
    settledRef.current = false
    setDraft(shape.name || '')
    setEditing(true)
  }

  function commit() {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
    const name = draft.trim()
    if (name === (shape.name || '')) return
    onRename(shape.id, name)
  }

  function cancel() {
    settledRef.current = true
    setEditing(false)
  }

  return (
    <div className={`fingering-card chord-library-card${note ? ' chord-library-card--pinned' : ''}`}>
      <button type="button" className="fingering-card-delete" aria-label="Удалить форму" onClick={onDelete}>
        <IconClose />
      </button>
      <ChordDiagram
        frets={frets}
        startFret={computeStartFret(frets)}
        barre={detectBarre(frets)}
        root={root}
      />
      {editing ? (
        <input
          className="chord-library-card-name-input"
          value={draft}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          placeholder={fallbackLabel(shape)}
          aria-label="Название формы"
        />
      ) : (
        <button
          type="button"
          className={`fingering-card-label chord-library-card-name${shape.name ? '' : ' chord-library-card-name--unnamed'}`}
          title="Переименовать"
          onClick={startEditing}
        >
          {shape.name || fallbackLabel(shape)}
        </button>
      )}
      {note && <span className="chord-library-card-note">{note}</span>}
    </div>
  )
}

export default function ChordLibraryPage({ onBack, initialChord }) {
  const [shapes, setShapes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  // Id of the shape saved a moment ago. It is shown even when it doesn't fit
  // the chord on screen — a save that leaves the page looking unchanged reads
  // as "nothing was added", which is exactly what it isn't.
  const [justAddedId, setJustAddedId] = useState(null)

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
      .filter((r) => r.fits)
      // Complete voicings first, then the ones that drop an omissible tone.
      .sort((a, b) => Number(b.exact) - Number(a.exact))
  }, [shapes, root, qualityIntervals, bass])

  // The just-saved shape when it doesn't play the chord currently selected —
  // pinned above the matches with a note saying so.
  const pinned = useMemo(() => {
    if (!justAddedId || results.some((r) => r.shape.id === justAddedId)) return null
    const shape = shapes.find((s) => s.id === justAddedId)
    if (!shape) return null
    return { shape, ...matchShape(shape, root, qualityIntervals, bass) }
  }, [justAddedId, results, shapes, root, qualityIntervals, bass])

  // Renaming touches one card, so it patches the loaded list in place instead
  // of going through reload() — a full refetch would blank the whole pane to
  // "Загрузка…" and back for a one-word edit.
  async function handleRename(shapeId, name) {
    const updated = await renameMovableShape(shapeId, name)
    setShapes((prev) =>
      prev.map((s) => (s.id === shapeId ? { ...s, name: updated ? updated.name : name || null } : s)),
    )
  }

  async function handleDelete(e, shapeId) {
    e.stopPropagation()
    await deleteMovableShape(shapeId)
    reload()
  }

  function selectChord(detected) {
    const rootLA = semitoneToLetterAccidental(detected.root)
    setRootLetter(rootLA.letter)
    setRootAccidental(rootLA.accidental)
    setQuality(detected.quality)
    if (detected.bass !== null && detected.bass !== undefined && detected.bass !== detected.root) {
      const bassLA = semitoneToLetterAccidental(detected.bass)
      setHasBass(true)
      setBassLetter(bassLA.letter)
      setBassAccidental(bassLA.accidental)
    } else {
      setHasBass(false)
    }
  }

  async function handleAddCommit(payload, detected) {
    const created = await createMovableShape({ ...payload, isCustom: true })
    setShowAdd(false)
    // Land on the chord the shape actually spells, so the new form is on
    // screen right after saving instead of being filtered out of a view the
    // user never left. Only when matchShape agrees, though — the detector can
    // fall back to a best-effort name for a note set that plays no chord it
    // knows, and jumping there would land on a chord this very page then has
    // to caption "saved, but doesn't sound like it".
    const detectedFits =
      detected &&
      matchShape(
        { rootString: payload.rootString, offsets: payload.offsets },
        detected.root,
        getQualityIntervals(detected.quality) || [],
        detected.bass ?? null,
      ).fits
    if (detectedFits) selectChord(detected)
    setJustAddedId(created && created.id ? created.id : null)
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
              setJustAddedId(null)
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
                onClick={() => {
                  setJustAddedId(null)
                  setQuality(q)
                }}
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
            onNone={() => {
              setJustAddedId(null)
              setHasBass(false)
            }}
            onChange={(l, a) => {
              setJustAddedId(null)
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
          ) : results.length === 0 && !pinned ? (
            <div className="chord-library-hint">Ни одна форма не подходит к «{chordName}» — добавьте новую</div>
          ) : (
            <div className="fingering-grid">
              {pinned && (
                <ShapeCard
                  key={pinned.shape.id}
                  shape={pinned.shape}
                  frets={pinned.frets}
                  root={root}
                  note={`Сохранено, но не звучит как «${chordName}»`}
                  onRename={handleRename}
                  onDelete={(e) => handleDelete(e, pinned.shape.id)}
                />
              )}
              {results.map(({ shape, frets }) => (
                <ShapeCard
                  key={shape.id}
                  shape={shape}
                  frets={frets}
                  root={root}
                  onRename={handleRename}
                  onDelete={(e) => handleDelete(e, shape.id)}
                />
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
