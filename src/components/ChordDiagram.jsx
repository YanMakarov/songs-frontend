const WIDTH = 130
const HEIGHT = 150
const LEFT = 20
const TOP = 15
const STRING_SPACING = 16
const FRET_SPACING = 28
const NUM_STRINGS = 6
const NUM_FRETS = 4

export default function ChordDiagram({ frets, startFret = 1 }) {
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

  for (let s = 0; s < NUM_STRINGS; s++) {
    const f = frets[s]
    if (f === -1) {
      mutes.push({ x: stringX[s], y: TOP - 8 })
    } else if (f === 0) {
      opens.push({ x: stringX[s], y: TOP - 8 })
    } else {
      const relativeFret = f - startFret
      if (relativeFret >= 0 && relativeFret < NUM_FRETS) {
        const dotY = TOP + relativeFret * FRET_SPACING + FRET_SPACING / 2
        dots.push({ x: stringX[s], y: dotY })
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className="chord-diagram"
    >
      {startFret === 1 ? (
        <line
          x1={LEFT}
          y1={TOP}
          x2={right}
          y2={TOP}
          stroke="currentColor"
          strokeWidth={4}
        />
      ) : (
        <text
          x={right + 12}
          y={TOP + 5}
          textAnchor="start"
          dominantBaseline="hanging"
          className="chord-diagram-fret-label"
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
        />
      ))}

      {mutes.map((pos, i) => (
        <text
          key={`mute-${i}`}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="central"
          className="chord-diagram-mute"
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
          className="chord-diagram-open"
        />
      ))}

      {dots.map((pos, i) => (
        <circle
          key={`dot-${i}`}
          cx={pos.x}
          cy={pos.y}
          r={7}
          fill="currentColor"
          className="chord-diagram-dot"
        />
      ))}
    </svg>
  )
}
