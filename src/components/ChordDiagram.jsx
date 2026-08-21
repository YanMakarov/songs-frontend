import { OPEN_STRINGS } from '../lib/chordNotes.js'
import { degreeLabel } from '../lib/voicing.js'

const WIDTH = 130
const HEIGHT = 150
const LEFT = 20
const TOP = 15
const STRING_SPACING = 16
const FRET_SPACING = 28
const NUM_STRINGS = 6
const NUM_FRETS = 4

function noteAt(stringIndex, fret) {
  return (OPEN_STRINGS[stringIndex] + fret) % 12
}

// root: semitone (0-11) of the chord root, used to label each dot with its
// scale degree (R, 3, 5, b7...) instead of a plain filled circle.
// barre: { fret, from, to } string indices, drawn as one bar instead of
// separate dots for the strings it covers.
// matchMask: per-string bool (or null). When given, strings that aren't
// actual tones of the target chord render faded — used to show a shape that
// doesn't fit a chord while still pointing out which of its notes do.
// dimmed: fades the fretboard itself (strings/frets/nut) too, so a
// non-matching shape reads as translucent overall, not just per-dot.
export default function ChordDiagram({ frets, startFret = 1, barre = null, root = null, matchMask = null, dimmed = false }) {
  const isDim = (s) => matchMask !== null && !matchMask[s]
  const diagramWidth = (NUM_STRINGS - 1) * STRING_SPACING
  const diagramHeight = NUM_FRETS * FRET_SPACING
  const right = LEFT + diagramWidth
  const bottom = TOP + diagramHeight

  const stringX = []
  for (let i = 0; i < NUM_STRINGS; i++) {
    stringX.push(LEFT + i * STRING_SPACING)
  }

  const fretLineY = []
  for (let i = 0; i <= NUM_FRETS; i++) {
    fretLineY.push(TOP + i * FRET_SPACING)
  }

  const dots = []
  const mutes = []
  const opens = []
  const barredStrings = new Set()
  if (barre) {
    for (let s = barre.from; s <= barre.to; s++) barredStrings.add(s)
  }

  for (let s = 0; s < NUM_STRINGS; s++) {
    const f = frets[s]
    if (f === -1) {
      mutes.push({ x: stringX[s], y: TOP - 8 })
    } else if (f === 0) {
      opens.push({ x: stringX[s], y: TOP - 8, dim: isDim(s) })
    } else if (barre && f === barre.fret && barredStrings.has(s)) {
      // covered by the barre bar below, no individual dot
    } else {
      const relativeFret = f - startFret
      if (relativeFret >= 0 && relativeFret < NUM_FRETS) {
        const dotY = TOP + relativeFret * FRET_SPACING + FRET_SPACING / 2
        dots.push({
          x: stringX[s],
          y: dotY,
          label: root !== null ? degreeLabel(noteAt(s, f) - root) : null,
          dim: isDim(s),
        })
      }
    }
  }

  const barreRelativeFret = barre ? barre.fret - startFret : null
  const showBarre = barre && barreRelativeFret >= 0 && barreRelativeFret < NUM_FRETS
  const barreDim = showBarre && matchMask !== null
    ? Array.from({ length: barre.to - barre.from + 1 }, (_, i) => barre.from + i).some((s) => isDim(s))
    : false

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`chord-diagram${dimmed ? ' chord-diagram--dimmed' : ''}`}
    >
      {startFret === 1 ? (
        <line
          x1={LEFT}
          y1={TOP}
          x2={right}
          y2={TOP}
          stroke="currentColor"
          strokeWidth={4}
          className="chord-diagram-structural"
        />
      ) : (
        <text
          x={right + 12}
          y={TOP + 5}
          textAnchor="start"
          dominantBaseline="hanging"
          className="chord-diagram-fret-label chord-diagram-structural"
        >
          {startFret}
        </text>
      )}

      {fretLineY.slice(startFret === 1 ? 1 : 0).map((y, i) => (
        <line
          key={`fret-${i}`}
          x1={LEFT}
          y1={y}
          x2={right}
          y2={y}
          stroke="currentColor"
          strokeWidth={1.5}
          className="chord-diagram-structural"
        />
      ))}

      {stringX.map((x, i) => (
        <line
          key={`string-${i}`}
          x1={x}
          y1={TOP}
          x2={x}
          y2={bottom}
          stroke="currentColor"
          strokeWidth={1}
          className="chord-diagram-structural"
        />
      ))}

      {mutes.map((pos, i) => (
        <text
          key={`mute-${i}`}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="central"
          className="chord-diagram-mute chord-diagram-structural"
        >
          ×
        </text>
      ))}

      {opens.map((pos, i) => (
        <circle
          key={`open-${i}`}
          cx={pos.x}
          cy={pos.y}
          r={5}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={`chord-diagram-open${pos.dim ? ' chord-diagram-open--dim' : ''}`}
        />
      ))}

      {showBarre && (
        <rect
          x={stringX[barre.from] - 8}
          y={TOP + barreRelativeFret * FRET_SPACING + FRET_SPACING / 2 - 8}
          width={stringX[barre.to] - stringX[barre.from] + 16}
          height={16}
          rx={8}
          className={`chord-diagram-barre${barreDim ? ' chord-diagram-barre--dim' : ''}`}
        />
      )}

      {dots.map((pos, i) => (
        <g key={`dot-${i}`} className={pos.dim ? 'chord-diagram-dot-group--dim' : ''}>
          <circle cx={pos.x} cy={pos.y} r={7} className="chord-diagram-dot" />
          {pos.label && (
            <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" className="chord-diagram-degree">
              {pos.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
