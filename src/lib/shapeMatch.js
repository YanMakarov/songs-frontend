// Movable-shape matching: a shape is a fixed fretting pattern (root string +
// per-string offsets from the barre fret). Its interval content relative to
// its own root is fixed no matter which root it's moved to — this derives
// that content and, for a chosen target chord, whether the shape produces it
// exactly or only partially.
import { OPEN_STRINGS } from './chordNotes.js'

const NUM_STRINGS = 6

function noteAt(stringIdx, fret) {
  return (OPEN_STRINGS[stringIdx] + fret) % 12
}

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
export function computeShapeFrets(rootString, offsets, targetRoot) {
  const barreFret = ((targetRoot - OPEN_STRINGS[rootString]) % 12 + 12) % 12
  return offsets.map((o) => (o === null || o === undefined ? -1 : o + barreFret))
}

// Compares a shape (moved to targetRoot) against a target chord (quality
// interval set + optional bass). Returns frets/startFret/barre for display,
// whether it's a full match, and which strings' notes are still chord tones
// even when it isn't (for the "dimmed but partially lit" rendering).
export function matchShape(shape, targetRoot, qualityIntervals, bass = null) {
  const { rootString, offsets } = shape
  const frets = computeShapeFrets(rootString, offsets, targetRoot)
  const shapeIntervals = computeShapeIntervals(rootString, offsets)

  const targetSet = new Set(qualityIntervals.map((iv) => iv % 12))
  const bassInterval = bass !== null && bass !== undefined ? ((bass - targetRoot) % 12 + 12) % 12 : null

  const matchMask = new Array(NUM_STRINGS).fill(false)
  let allMatch = true
  let anyMatch = false
  for (let s = 0; s < NUM_STRINGS; s++) {
    if (frets[s] < 0) continue
    const iv = shapeIntervals[s]
    const ok = targetSet.has(iv)
    matchMask[s] = ok
    if (ok) anyMatch = true
    else allMatch = false
  }
  // Every target interval must also be present somewhere in the shape for
  // it to count as a real match, not just "doesn't contradict".
  const shapeIntervalSet = new Set(Object.values(shapeIntervals))
  for (const iv of targetSet) {
    if (!shapeIntervalSet.has(iv)) allMatch = false
  }
  const bassOk = bassInterval === null || shapeIntervalSet.has(bassInterval)
  const fullMatch = allMatch && bassOk

  return { frets, fullMatch, matchMask, anyMatch }
}
