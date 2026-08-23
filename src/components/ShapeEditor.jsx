import { useMemo, useState } from 'react'
import { NOTE_NAMES, OPEN_STRINGS, notesToChord } from '../lib/chordNotes.js'

const NUM_STRINGS = 6
const VISIBLE_FRETS = 12
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

function rowY(s) {
  return TOP_MARGIN + (NUM_STRINGS - 1 - s) * STRING_SPACING
}

// Tap out any shape; the lowest-indexed string playing the detected root
// becomes the shape's anchor, and every other tapped fret is stored as an
// offset from it — that's what lets the same shape slide to any root later.
export default function ShapeEditor({ onCommit, onClose }) {
  const [selectedPositions, setSelectedPositions] = useState(new Set())
  const [name, setName] = useState('')

  const entries = useMemo(
    () => [...selectedPositions].map((p) => p.split(',').map(Number)),
    [selectedPositions],
  )

  const selectedNotes = useMemo(() => {
    const notes = new Set()
    for (const [s, f] of entries) notes.add(noteAt(s, f))
    return notes
  }, [entries])

  const physicalBass = useMemo(() => {
    let lowest = null
    for (const [s, f] of entries) {
      if (lowest === null || s < lowest.s) lowest = { s, f }
    }
    return lowest ? noteAt(lowest.s, lowest.f) : null
  }, [entries])

  const detected = useMemo(
    () => (selectedNotes.size >= 2 ? notesToChord(selectedNotes, physicalBass) : null),
    [selectedNotes, physicalBass],
  )

  const shape = useMemo(() => {
    if (!detected || entries.length === 0) return null
    const rootCandidates = entries.filter(([s, f]) => noteAt(s, f) === detected.root).map(([s]) => s)
    if (!rootCandidates.length) return null
    const rootString = Math.min(...rootCandidates)
    const rootEntry = entries.find(([s]) => s === rootString)
    const rootFret = rootEntry[1]
    const offsets = new Array(NUM_STRINGS).fill(null)
    for (const [s, f] of entries) offsets[s] = f - rootFret
    return { rootString, offsets }
  }, [entries, detected])

  function togglePosition(stringIdx, fret) {
    const key = `${stringIdx},${fret}`
    const newSet = new Set(selectedPositions)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      for (const pos of newSet) {
        if (pos.startsWith(`${stringIdx},`)) newSet.delete(pos)
      }
      newSet.add(key)
    }
    setSelectedPositions(newSet)
  }

  function handleClear() {
    setSelectedPositions(new Set())
    setName('')
  }

  function handleSave() {
    if (!shape) return
    // `detected` rides along so the caller can show the saved shape under the
    // chord it actually is, rather than whatever chord happened to be open.
    onCommit({ name: name.trim() || null, rootString: shape.rootString, offsets: shape.offsets }, detected)
  }

  function isSelected(s, f) {
    return selectedPositions.has(`${s},${f}`)
  }

  return (
    <div className="shape-editor">
      <svg className="fretboard-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} width="100%" height={SVG_HEIGHT}>
        {[3, 5, 7, 9, 12].map((fret) => {
          const x = LEFT_MARGIN + fret * FRET_WIDTH - FRET_WIDTH / 2
          const y = TOP_MARGIN + (NUM_STRINGS - 1) * STRING_SPACING + 15
          return <circle key={`marker-${fret}`} cx={x} cy={y} r={4} fill="var(--text-secondary)" opacity={0.4} />
        })}

        {Array.from({ length: VISIBLE_FRETS }, (_, i) => i + 1).map((fret) => {
          const x = LEFT_MARGIN + fret * FRET_WIDTH - FRET_WIDTH / 2
          return (
            <text key={`fret-num-${fret}`} x={x} y={12} textAnchor="middle" className="fretboard-fret-number">
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

        {Array.from({ length: NUM_STRINGS }, (_, s) => (
          <line
            key={`string-${s}`}
            x1={LEFT_MARGIN}
            y1={rowY(s)}
            x2={LEFT_MARGIN + VISIBLE_FRETS * FRET_WIDTH}
            y2={rowY(s)}
            stroke="var(--text)"
            strokeWidth={s < 3 ? 2 : 1}
          />
        ))}

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

        {STRING_NAMES.map((n, s) => (
          <text
            key={`string-name-${s}`}
            x={LEFT_MARGIN - 12}
            y={rowY(s)}
            textAnchor="end"
            dominantBaseline="central"
            className="fretboard-string-name"
          >
            {n}
          </text>
        ))}

        {Array.from({ length: NUM_STRINGS }, (_, s) =>
          Array.from({ length: VISIBLE_FRETS + 1 }, (_, f) => {
            const x = f === 0 ? LEFT_MARGIN : LEFT_MARGIN + (f - 0.5) * FRET_WIDTH
            const y = rowY(s)
            const selected = isSelected(s, f)
            const isRootString = shape && shape.rootString === s && selected
            return (
              <g key={`pos-${s}-${f}`} className="fretboard-position" onClick={() => togglePosition(s, f)}>
                {selected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={DOT_RADIUS}
                    fill={isRootString ? 'var(--accent)' : 'var(--text-secondary)'}
                    className="fretboard-dot"
                  />
                )}
                {selected && (
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fretboard-note-label" fill="#fff">
                    {NOTE_NAMES[noteAt(s, f)]}
                  </text>
                )}
                <circle cx={x} cy={y} r={DOT_RADIUS + 5} fill="transparent" style={{ cursor: 'pointer' }} />
              </g>
            )
          }),
        )}
      </svg>

      <div className="shape-editor-info">
        {detected && shape
          ? `Похоже на «${detected.quality || 'мажор'}», корень — ${6 - shape.rootString}-я струна`
          : 'Натыкайте форму на грифе — минимум 2 ноты'}
      </div>

      <input
        className="shape-editor-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название формы (необязательно), напр. «E — мажор»"
      />

      <div className="fretboard-editor-actions">
        <button className="ghost-btn" onClick={handleClear}>
          Очистить
        </button>
        <button className="ghost-btn" onClick={onClose}>
          Отмена
        </button>
        <button className="accent-btn" onClick={handleSave} disabled={!shape}>
          Сохранить
        </button>
      </div>
    </div>
  )
}
