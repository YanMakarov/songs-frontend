// Curated fingering library. This is the piece that replaces "search every
// geometrically possible shape" with "show the handful of shapes guitarists
// actually use": a few hand-picked open-position chords, plus the two
// standard movable barre shapes (E-form and A-form) that cover every root.
//
// To teach the system a new chord: add an OPEN_SHAPES entry (exact frets,
// only valid at that one root) or, if it generalizes to every root, add a
// row to E_FORM_TEMPLATES / A_FORM_TEMPLATES (offsets from the barre fret;
// `null` = muted string). Anything not covered here falls back to the
// brute-force search in fretboardSearch.js.
import { OPEN_STRINGS } from './chordNotes.js'
import { findFingerings } from './fretboardSearch.js'
import { computeStartFret, detectBarre } from './voicing.js'

const MAX_RESULTS = 4

// Open-position shapes: exact frets, string order low-E..high-e (-1 = mute).
// Keyed by "root-quality".
const OPEN_SHAPES = {
  '4-':      [0, 2, 2, 1, 0, 0],   // E
  '4-m':     [0, 2, 2, 0, 0, 0],   // Em
  '4-7':     [0, 2, 0, 1, 0, 0],   // E7
  '4-m7':    [0, 2, 0, 0, 0, 0],   // Em7
  '4-maj7':  [0, 2, 1, 1, 0, 0],   // Emaj7
  '4-sus4':  [0, 2, 2, 2, 0, 0],   // Esus4
  '4-5':     [0, 2, 2, -1, -1, -1],// E5

  '9-':      [-1, 0, 2, 2, 2, 0],  // A
  '9-m':     [-1, 0, 2, 2, 1, 0],  // Am
  '9-7':     [-1, 0, 2, 0, 2, 0],  // A7
  '9-m7':    [-1, 0, 2, 0, 1, 0],  // Am7
  '9-maj7':  [-1, 0, 2, 1, 2, 0],  // Amaj7
  '9-sus2':  [-1, 0, 2, 2, 0, 0],  // Asus2
  '9-sus4':  [-1, 0, 2, 2, 3, 0],  // Asus4
  '9-5':     [-1, 0, 2, 2, -1, -1],// A5

  '2-':      [-1, -1, 0, 2, 3, 2], // D
  '2-m':     [-1, -1, 0, 2, 3, 1], // Dm
  '2-7':     [-1, -1, 0, 2, 1, 2], // D7
  '2-m7':    [-1, -1, 0, 2, 1, 1], // Dm7
  '2-maj7':  [-1, -1, 0, 2, 2, 2], // Dmaj7
  '2-sus2':  [-1, -1, 0, 2, 3, 0], // Dsus2
  '2-sus4':  [-1, -1, 0, 2, 3, 3], // Dsus4
  '2-5':     [-1, -1, 0, 2, -1, -1],// D5

  '7-':      [3, 2, 0, 0, 0, 3],   // G
  '7-7':     [3, 2, 0, 0, 0, 1],   // G7
  '7-maj7':  [3, 2, 0, 0, 0, 2],   // Gmaj7

  '0-':      [-1, 3, 2, 0, 1, 0],  // C
  '0-maj7':  [-1, 3, 2, 0, 0, 0],  // Cmaj7
  '0-7':     [-1, 3, 2, 3, 1, 0],  // C7

  '11-7':    [-1, 2, 1, 2, 0, 2],  // B7

  '5-maj7':  [-1, -1, 3, 2, 1, 0], // Fmaj7 (open-ish, no barre needed)
}

// Movable shapes: offsets from the barre fret, string order low-E..high-e.
// `null` = muted string.
const E_FORM_TEMPLATES = {
  '':     [0, 2, 2, 1, 0, 0],
  'm':    [0, 2, 2, 0, 0, 0],
  '7':    [0, 2, 0, 1, 0, 0],
  'm7':   [0, 2, 0, 0, 0, 0],
  'maj7': [0, 2, 1, 1, 0, 0],
  'sus4': [0, 2, 2, 2, 0, 0],
  '5':    [0, 2, 2, null, null, null],
}

const A_FORM_TEMPLATES = {
  '':     [null, 0, 2, 2, 2, 0],
  'm':    [null, 0, 2, 2, 1, 0],
  '7':    [null, 0, 2, 0, 2, 0],
  'm7':   [null, 0, 2, 0, 1, 0],
  'maj7': [null, 0, 2, 1, 2, 0],
  'sus4': [null, 0, 2, 2, 3, 0],
  'sus2': [null, 0, 2, 2, 0, 0],
  '5':    [null, 0, 2, 2, null, null],
}

function key(frets) {
  return frets.join(',')
}

function movableShape(templates, rootStringIdx, root, quality) {
  const offsets = templates[quality]
  if (!offsets) return null
  const barreFret = ((root - OPEN_STRINGS[rootStringIdx]) % 12 + 12) % 12
  if (barreFret === 0) return null // coincides with an open shape, if any
  const frets = offsets.map((o) => (o === null ? -1 : o + barreFret))
  if (Math.max(...frets) > 15) return null
  const soundingIdx = frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0)
  return {
    frets,
    startFret: computeStartFret(frets),
    barre: { fret: barreFret, from: soundingIdx[0], to: soundingIdx[soundingIdx.length - 1] },
    source: 'curated',
  }
}

// Main entry point: curated shapes first, topped up with the algorithmic
// search when curation doesn't cover this chord (or when a bass note makes
// a fixed shape invalid).
export function getFingerings(root, quality, bass = null) {
  const results = []
  const seen = new Set()

  function push(entry) {
    const k = key(entry.frets)
    if (seen.has(k)) return
    seen.add(k)
    results.push(entry)
  }

  const hasSlashBass = bass !== null && bass !== undefined && bass !== root

  if (!hasSlashBass) {
    const openShape = OPEN_SHAPES[`${root}-${quality}`]
    if (openShape) {
      push({ frets: openShape, startFret: computeStartFret(openShape), barre: null, source: 'curated' })
    }
    const eForm = movableShape(E_FORM_TEMPLATES, 0, root, quality)
    if (eForm) push(eForm)
    const aForm = movableShape(A_FORM_TEMPLATES, 1, root, quality)
    if (aForm) push(aForm)
  }

  return results.slice(0, MAX_RESULTS).map((r) => ({ ...r, auto: r.source !== 'curated' }))
}

// Convenience wrapper used by the UI: takes a parsed chord (as returned by
// chordToNotes) and tops up curated results with the brute-force search.
export function getFingeringsForChord(parsedChord) {
  if (!parsedChord) return []
  const { root, quality, bass, notes } = parsedChord
  const curated = getFingerings(root, quality, bass)
  if (curated.length >= MAX_RESULTS) return curated

  const seen = new Set(curated.map((r) => key(r.frets)))
  const fallback = findFingerings(notes, bass)
  for (const f of fallback) {
    const k = key(f.frets)
    if (seen.has(k)) continue
    seen.add(k)
    curated.push({ ...f, barre: detectBarre(f.frets), source: 'auto', auto: true })
    if (curated.length >= MAX_RESULTS) break
  }
  return curated
}
