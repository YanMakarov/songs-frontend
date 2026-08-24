import { useMemo, useState } from 'react'
import { NOTE_NAMES, OPEN_STRINGS, notesToChordCandidates } from '../lib/chordNotes.js'

const NUM_STRINGS = 6
const VISIBLE_FRETS = 12
// How many readings of the same notes to offer. Enough for the real choices
// (chord, its inversion, the chord over a foreign bass, a rootless reading),
// short of listing every near miss.
const MAX_READINGS = 6
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

function readingId(c) {
  return `${c.root}-${c.quality}-${c.bass === null ? 'x' : c.bass}`
}

// Where the root would sit if there were a finger free for it. A rootless
// grip still has to be stored as offsets from *some* root, or it could never
// slide to another root — but the string it is measured from doesn't have to
// be one that sounds. Pick the placement nearest the frets actually played,
// so the offsets stay small and the shape stays inside the neck when moved.
function virtualAnchor(root, entries) {
  const frets = entries.map(([, f]) => f)
  const centre = (Math.min(...frets) + Math.max(...frets)) / 2
  let best = null
  for (let s = 0; s < NUM_STRINGS; s++) {
    const base = ((root - OPEN_STRINGS[s]) % 12 + 12) % 12
    for (const fret of [base, base + 12]) {
      const cand = { string: s, fret, distance: Math.abs(fret - centre) }
      if (!best || cand.distance < best.distance) best = cand
    }
  }
  return best
}

// Tap out any shape; the root of the reading you pick becomes the shape's
// anchor, and every other tapped fret is stored as an offset from it — that's
// what lets the same shape slide to any root later.
export default function ShapeEditor({ onCommit, onClose }) {
  const [selectedPositions, setSelectedPositions] = useState(new Set())
  const [name, setName] = useState('')
  // Which reading of the tapped notes the user picked, if they picked one.
  // The notes alone can't decide it: E-F#-B is Esus2, Bsus4 and a rootless
  // Cmaj7#11 at once, and an Am7 grip with a G underneath is Am7, Am7/G,
  // Am/G or C6/G depending on what it's for.
  const [chosenId, setChosenId] = useState(null)

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

  const candidates = useMemo(
    () =>
      selectedNotes.size >= 2
        ? notesToChordCandidates(selectedNotes, physicalBass, { includeRootless: true }).slice(0, MAX_READINGS)
        : [],
    [selectedNotes, physicalBass],
  )

  const detected = useMemo(
    () => candidates.find((c) => readingId(c) === chosenId) || candidates[0] || null,
    [candidates, chosenId],
  )

  const shape = useMemo(() => {
    if (!detected || entries.length === 0) return null
    const played = entries.filter(([s, f]) => noteAt(s, f) === detected.root).map(([s]) => s)
    let rootString
    let rootFret
    if (played.length) {
      rootString = Math.min(...played)
      rootFret = entries.find(([s]) => s === rootString)[1]
    } else {
      const anchor = virtualAnchor(detected.root, entries)
      rootString = anchor.string
      rootFret = anchor.fret
    }
    const offsets = new Array(NUM_STRINGS).fill(null)
    for (const [s, f] of entries) offsets[s] = f - rootFret
    return { rootString, rootFret, offsets, rootless: played.length === 0 }
  }, [entries, detected])

  function togglePosition(stringIdx, fret) {
    // Different notes, different readings — the old pick doesn't survive.
    setChosenId(null)
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
    setChosenId(null)
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

        {shape && shape.rootless && shape.rootFret <= VISIBLE_FRETS && (
          // The root this reading is named after, where it would be played.
          // Nothing sounds it — but the shape is measured from it, so it is
          // worth seeing, and tapping it turns the reading into a plain one.
          <g className="fretboard-ghost-root">
            <circle
              cx={shape.rootFret === 0 ? LEFT_MARGIN : LEFT_MARGIN + (shape.rootFret - 0.5) * FRET_WIDTH}
              cy={rowY(shape.rootString)}
              r={DOT_RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
            <text
              x={shape.rootFret === 0 ? LEFT_MARGIN : LEFT_MARGIN + (shape.rootFret - 0.5) * FRET_WIDTH}
              y={rowY(shape.rootString)}
              textAnchor="middle"
              dominantBaseline="central"
              className="fretboard-note-label"
              fill="var(--accent)"
            >
              {NOTE_NAMES[detected.root]}
            </text>
          </g>
        )}

        {Array.from({ length: NUM_STRINGS }, (_, s) =>
          Array.from({ length: VISIBLE_FRETS + 1 }, (_, f) => {
            const x = f === 0 ? LEFT_MARGIN : LEFT_MARGIN + (f - 0.5) * FRET_WIDTH
            const y = rowY(s)
            const selected = isSelected(s, f)
            const isRootString = shape && !shape.rootless && shape.rootString === s && selected
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

      {candidates.length > 1 && (
        <div className="shape-editor-readings">
          {candidates.map((c) => (
            <button
              key={readingId(c)}
              type="button"
              className={`chord-library-tag${detected && readingId(c) === readingId(detected) ? ' active' : ''}`}
              onClick={() => setChosenId(readingId(c))}
            >
              {c.name}
              {c.rootless && <span className="shape-editor-reading-mark">без осн.</span>}
              {!c.fits && <span className="shape-editor-reading-mark">≈</span>}
            </button>
          ))}
        </div>
      )}

      <div className="shape-editor-info">
        {detected && shape
          ? shape.rootless
            ? `«${detected.name}» — основной тон не звучит, форма отсчитывается от ${6 - shape.rootString}-й струны`
            : `«${detected.name}» — корень на ${6 - shape.rootString}-й струне`
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
