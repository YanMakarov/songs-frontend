import { useEffect, useMemo, useRef, useState } from 'react'
import { chordToNotes, notesToChord, NOTE_NAMES, OPEN_STRINGS } from '../lib/chordNotes.js'
import { getFingeringsForChord } from '../lib/chordShapes.js'

const NUM_STRINGS = 6
const VISIBLE_FRETS = 12
// Tab-style order: thinnest string (high e, 1st) on top, low E (6th) on the
// bottom — matches how guitarists read a chart, not the physical string index.
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E']

const SVG_WIDTH = 520
const SVG_HEIGHT = 200
const LEFT_MARGIN = 30
const TOP_MARGIN = 25
const FRET_WIDTH = 40
const STRING_SPACING = 28
const DOT_RADIUS = 10

function noteAt(stringIdx, fret) {
  return (OPEN_STRINGS[stringIdx] + fret) % 12
}

function noteNameAt(stringIdx, fret) {
  return NOTE_NAMES[noteAt(stringIdx, fret)]
}

// Visual row for string index s: 0 (high e) at the top, 5 (low E) at the bottom.
function rowY(s) {
  return TOP_MARGIN + (NUM_STRINGS - 1 - s) * STRING_SPACING
}

function positionsToFrets(positions) {
  const frets = new Array(NUM_STRINGS).fill(-1)
  for (const pos of positions) {
    const [s, f] = pos.split(',').map(Number)
    frets[s] = f
  }
  return frets
}

export default function ChordFretboardEditor({ initialValue, initialFrets, onCommit, onClose }) {
  // Track selected positions as "string,fret" strings
  const [selectedPositions, setSelectedPositions] = useState(() => {
    if (!initialFrets) return new Set()
    const set = new Set()
    initialFrets.forEach((f, s) => {
      if (f >= 0) set.add(`${s},${f}`)
    })
    return set
  })
  const [chordInput, setChordInput] = useState(initialValue || '')
  const [bassNote, setBassNote] = useState(null)
  const [highlightedFrets, setHighlightedFrets] = useState(null)
  const inputRef = useRef(null)
  // The very first render already has a hand-picked shape (from initialFrets,
  // or the caller passed an existing chord name) — don't let the name-driven
  // autofill effect below immediately stomp on it.
  const skipNextAutofill = useRef(Boolean(initialFrets))

  // Derive note set from selected positions
  const selectedNotes = useMemo(() => {
    const notes = new Set()
    for (const pos of selectedPositions) {
      const [s, f] = pos.split(',').map(Number)
      notes.add(noteAt(s, f))
    }
    return notes
  }, [selectedPositions])

  const parsedChord = useMemo(() => {
    if (!chordInput.trim()) return null
    return chordToNotes(chordInput.trim())
  }, [chordInput])

  // The lowest-indexed string among what's actually tapped is the physical
  // bass note — not the smallest semitone number (see notesToChord).
  const physicalBass = useMemo(() => {
    let lowestString = null
    for (const pos of selectedPositions) {
      const [s, f] = pos.split(',').map(Number)
      if (lowestString === null || s < lowestString.s) lowestString = { s, f }
    }
    return lowestString ? noteAt(lowestString.s, lowestString.f) : null
  }, [selectedPositions])

  const detectedChord = useMemo(() => {
    if (selectedNotes.size < 2) return null
    return notesToChord(selectedNotes, physicalBass)
  }, [selectedNotes, physicalBass])

  const suggestionName = detectedChord && detectedChord.name !== chordInput.trim() ? detectedChord.name : null

  // When the typed chord name changes, suggest positions for it (best curated
  // shape first). The user can still tap their own — this only pre-fills.
  useEffect(() => {
    if (!parsedChord) return
    if (skipNextAutofill.current) {
      skipNextAutofill.current = false
      setBassNote(parsedChord.bass)
      return
    }
    const fingerings = getFingeringsForChord(parsedChord)
    if (fingerings.length > 0) {
      const best = fingerings[0]
      const posSet = new Set()
      for (let s = 0; s < NUM_STRINGS; s++) {
        if (best.frets[s] >= 0) posSet.add(`${s},${best.frets[s]}`)
      }
      setSelectedPositions(posSet)
      setBassNote(parsedChord.bass)

      const highlightSet = new Set()
      for (const f of fingerings.slice(0, 3)) {
        for (let s = 0; s < NUM_STRINGS; s++) {
          if (f.frets[s] >= 0) highlightSet.add(`${s},${f.frets[s]}`)
        }
      }
      setHighlightedFrets(highlightSet)
    }
  }, [parsedChord])

  function togglePosition(stringIdx, fret) {
    const key = `${stringIdx},${fret}`
    const newSet = new Set(selectedPositions)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      // A string can only sound one fret at a time.
      for (const pos of newSet) {
        if (pos.startsWith(`${stringIdx},`)) newSet.delete(pos)
      }
      newSet.add(key)
    }
    setSelectedPositions(newSet)
    setChordInput('')
  }

  function handleInputChange(e) {
    setChordInput(e.target.value)
  }

  function handleAcceptSuggestion() {
    if (!suggestionName) return
    skipNextAutofill.current = true
    setChordInput(suggestionName)
  }

  // Chords can't be saved unnamed — Apply is disabled without one (see below).
  function handleCommit() {
    const name = detectedChord?.name || chordInput.trim()
    if (!name) return
    const frets = selectedPositions.size > 0 ? positionsToFrets(selectedPositions) : null
    onCommit({ name, frets })
  }

  function handleClear() {
    setSelectedPositions(new Set())
    setChordInput('')
    setBassNote(null)
    setHighlightedFrets(null)
  }

  function handleBassSelect(note) {
    setBassNote(bassNote === note ? null : note)
  }

  function isHighlighted(stringIdx, fret) {
    if (!highlightedFrets) return false
    return highlightedFrets.has(`${stringIdx},${fret}`)
  }

  function isSelected(stringIdx, fret) {
    return selectedPositions.has(`${stringIdx},${fret}`)
  }

  const fretMarkers = [3, 5, 7, 9, 12]

  return (
    <div className="fretboard-editor">
      <div className="fretboard-editor-header">
        <input
          ref={inputRef}
          className="fretboard-editor-input"
          type="text"
          value={chordInput}
          onChange={handleInputChange}
          placeholder="Введите аккорд (напр. Cmaj7, D/A)"
          autoFocus
        />
        {suggestionName && (
          <button type="button" className="fretboard-editor-suggestion" onClick={handleAcceptSuggestion}>
            Похоже на {suggestionName} →
          </button>
        )}
      </div>

      <svg
        className="fretboard-svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        height={SVG_HEIGHT}
      >
        {fretMarkers.map(fret => {
          const x = LEFT_MARGIN + fret * FRET_WIDTH - FRET_WIDTH / 2
          const y = TOP_MARGIN + (NUM_STRINGS - 1) * STRING_SPACING + 15
          return (
            <circle
              key={`marker-${fret}`}
              cx={x}
              cy={y}
              r={4}
              fill="var(--text-secondary)"
              opacity={0.4}
            />
          )
        })}

        {Array.from({ length: VISIBLE_FRETS }, (_, i) => i + 1).map(fret => {
          const x = LEFT_MARGIN + fret * FRET_WIDTH - FRET_WIDTH / 2
          return (
            <text
              key={`fret-num-${fret}`}
              x={x}
              y={12}
              textAnchor="middle"
              className="fretboard-fret-number"
            >
              {fret}
            </text>
          )
        })}

        <line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN - 5}
          x2={LEFT_MARGIN}
          y2={TOP_MARGIN + (NUM_STRINGS - 1) * STRING_SPACING + 5}
          stroke="var(--text)"
          strokeWidth={4}
        />

        {Array.from({ length: NUM_STRINGS }, (_, s) => {
          const y = rowY(s)
          return (
            <line
              key={`string-${s}`}
              x1={LEFT_MARGIN}
              y1={y}
              x2={LEFT_MARGIN + VISIBLE_FRETS * FRET_WIDTH}
              y2={y}
              stroke="var(--text)"
              strokeWidth={s < 3 ? 2 : 1}
            />
          )
        })}

        {Array.from({ length: VISIBLE_FRETS + 1 }, (_, i) => {
          const x = LEFT_MARGIN + i * FRET_WIDTH
          return (
            <line
              key={`fret-${i}`}
              x1={x}
              y1={TOP_MARGIN - 5}
              x2={x}
              y2={TOP_MARGIN + (NUM_STRINGS - 1) * STRING_SPACING + 5}
              stroke="var(--text)"
              strokeWidth={1}
              opacity={0.6}
            />
          )
        })}

        {STRING_NAMES.map((name, s) => (
          <text
            key={`string-name-${s}`}
            x={LEFT_MARGIN - 12}
            y={rowY(s)}
            textAnchor="end"
            dominantBaseline="central"
            className="fretboard-string-name"
          >
            {name}
          </text>
        ))}

        {Array.from({ length: NUM_STRINGS }, (_, s) =>
          Array.from({ length: VISIBLE_FRETS + 1 }, (_, f) => {
            // Open strings sit on the nut; fretted notes sit in the space
            // between two fret wires, not on top of one.
            const x = f === 0 ? LEFT_MARGIN : LEFT_MARGIN + (f - 0.5) * FRET_WIDTH
            const y = rowY(s)
            const selected = isSelected(s, f)
            const highlighted = isHighlighted(s, f)
            const noteName = noteNameAt(s, f)

            return (
              <g
                key={`pos-${s}-${f}`}
                className="fretboard-position"
                onClick={() => togglePosition(s, f)}
              >
                {highlighted && !selected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={DOT_RADIUS + 3}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    opacity={0.5}
                  />
                )}
                {selected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={DOT_RADIUS}
                    fill="var(--accent)"
                    className="fretboard-dot"
                  />
                )}
                {(selected || highlighted) && (
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fretboard-note-label"
                    fill={selected ? '#fff' : 'var(--accent)'}
                  >
                    {noteName}
                  </text>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={DOT_RADIUS + 5}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })
        )}
      </svg>

      {selectedNotes.size >= 2 && (
        <div className="fretboard-bass-selector">
          <span className="fretboard-bass-label">Бас:</span>
          {NOTE_NAMES.map((name, i) => {
            if (!selectedNotes.has(i)) return null
            return (
              <button
                key={i}
                className={`fretboard-bass-btn${bassNote === i ? ' active' : ''}`}
                onClick={() => handleBassSelect(i)}
              >
                {name}
              </button>
            )
          })}
          {bassNote !== null && (
            <button
              className="fretboard-bass-btn fretboard-bass-clear"
              onClick={() => setBassNote(null)}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="fretboard-editor-actions">
        <button className="ghost-btn" onClick={handleClear}>
          Очистить
        </button>
        <button
          className="accent-btn"
          onClick={handleCommit}
          disabled={!detectedChord && !chordInput.trim()}
        >
          Применить
        </button>
      </div>
    </div>
  )
}
