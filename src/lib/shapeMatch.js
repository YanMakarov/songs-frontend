// Movable-shape matching: a shape is a fixed fretting pattern (root string +
// per-string offsets from the barre fret). Its interval content relative to
// its own root is fixed no matter which root it's moved to — this derives
// that content and, for a chosen target chord, whether the shape produces it.
import { chordFitsIntervals, OPEN_STRINGS } from './chordNotes.js'

const NUM_STRINGS = 6
// Diagrams (and the 1-hex-char-per-string voicing code) stop here, so a shape
// that only lands above this fret isn't offered for that root.
const MAX_FRET = 15

// Interval (0-11) each string contributes relative to the shape's own root,
// keyed by string index; muted strings are absent. Transposition-invariant.
export function computeShapeIntervals(rootString, offsets) {
  const intervals = {}
  const rootOpen = OPEN_STRINGS[rootString]
  for (let s = 0; s < NUM_STRINGS; s++) {
    const o = offsets[s]
    if (o === null || o === undefined) continue
    intervals[s] = ((OPEN_STRINGS[s] + o - rootOpen) % 12 + 12) % 12
  }
  return intervals
}

// Absolute frets when this shape's root is moved to targetRoot (0-11).
// A shape can reach below its own root fret (a note on a higher string, at a
// lower fret) — at the bottom of the neck that would land behind the nut, so
// the whole shape moves up an octave instead of producing negative frets,
// which the diagram would otherwise read as muted strings.
export function computeShapeFrets(rootString, offsets, targetRoot) {
  let barreFret = ((targetRoot - OPEN_STRINGS[rootString]) % 12 + 12) % 12
  const sounding = offsets.filter((o) => o !== null && o !== undefined)
  const minOffset = sounding.length ? Math.min(...sounding) : 0
  while (barreFret + minOffset < 0) barreFret += 12
  return offsets.map((o) => (o === null || o === undefined ? -1 : o + barreFret))
}

// Compares a shape (moved to targetRoot) against a target chord (quality
// interval set + optional bass).
//
// `fits`  — the shape is playable as this chord: it sounds no note outside
//           the chord, carries every tone the chord can't do without, and
//           reaches the bass note if one was asked for. Voicings that drop
//           an omissible tone count; that's how extended chords are played.
// `exact` — on top of that, nothing at all is missing. Used for ordering, so
//           the complete voicings come first.
export function matchShape(shape, targetRoot, qualityIntervals, bass = null) {
  const { rootString, offsets } = shape
  const frets = computeShapeFrets(rootString, offsets, targetRoot)
  const shapeIntervals = computeShapeIntervals(rootString, offsets)
  const shapeIntervalSet = new Set(Object.values(shapeIntervals))

  const spelling = chordFitsIntervals(shapeIntervalSet, qualityIntervals)

  const bassInterval = bass !== null && bass !== undefined ? ((bass - targetRoot) % 12 + 12) % 12 : null
  const bassMissing = bassInterval !== null && !shapeIntervalSet.has(bassInterval)
  const outOfRange = frets.some((f) => f > MAX_FRET)

  const fits = spelling.fits && !bassMissing && !outOfRange
  return { frets, fits, exact: fits && spelling.exact }
}
