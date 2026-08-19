import { noteToSemitone, semitoneToNote, parseChord, normalizeChordText } from './music.js'

// Intervals (in semitones from root) for each chord quality.
// Values > 12 mean compound intervals (9th=14, 11th=17, 13th=21).
const QUALITY_INTERVALS = {
  '':       [0, 4, 7],
  'm':      [0, 3, 7],
  '7':      [0, 4, 7, 10],
  'm7':     [0, 3, 7, 10],
  'maj7':   [0, 4, 7, 11],
  'dim':    [0, 3, 6],
  'aug':    [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  '9':      [0, 4, 7, 10, 14],
  'm9':     [0, 3, 7, 10, 14],
  'maj9':   [0, 4, 7, 11, 14],
  'add9':   [0, 4, 7, 14],
  'madd9':  [0, 3, 7, 14],
  '7sus4':  [0, 5, 7, 10],
  'dim7':   [0, 3, 6, 9],
  'm7b5':   [0, 3, 6, 10],
  '5':      [0, 7],
  '11':     [0, 4, 7, 10, 14, 17],
  'm11':    [0, 3, 7, 10, 14, 17],
  'maj11':  [0, 4, 7, 11, 14, 17],
  '13':     [0, 4, 7, 10, 14, 17, 21],
  'm13':    [0, 3, 7, 10, 14, 17, 21],
  'maj13':  [0, 4, 7, 11, 14, 17, 21],
  '69':     [0, 4, 7, 9, 14],
  'm69':    [0, 3, 7, 9, 14],
}

// Standard guitar tuning: E2 A2 D3 G3 B3 E4 → semitones from C
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]

// All 12 note names (sharp) for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function normalizeNote(name) {
  const n = name.trim()
  const st = noteToSemitone(n)
  if (st !== null) return st
  return null
}

// Convert a chord string to a set of note semitones (mod 12).
// Supports slash chords: "D/A" → D major triad with A in bass.
// Returns { notes: Set<number>, root: number, bass: number|null, quality: string }
export function chordToNotes(chordStr) {
  if (!chordStr) return null
  const raw = normalizeChordText(chordStr.trim())
  const slashIdx = raw.indexOf('/')
  let mainStr, bassStr
  if (slashIdx !== -1) {
    mainStr = raw.slice(0, slashIdx)
    bassStr = raw.slice(slashIdx + 1)
  } else {
    mainStr = raw
    bassStr = null
  }

  const { root, suffix } = parseChord(mainStr)
  if (!root) return null
  const rootSemitone = noteToSemitone(root)
  if (rootSemitone === null) return null

  const intervals = QUALITY_INTERVALS[suffix]
  if (!intervals) return null

  const notes = new Set()
  for (const iv of intervals) {
    notes.add((rootSemitone + iv) % 12)
  }

  let bassSemitone = null
  if (bassStr) {
    const bn = normalizeNote(bassStr)
    if (bn !== null) {
      bassSemitone = bn
      notes.add(bn)
    }
  }

  return { notes, root: rootSemitone, bass: bassSemitone, quality: suffix, rootName: root }
}

// Given a set of note semitones, find the best matching chord name.
// Tries each note as potential root, finds quality with most interval matches.
// If the lowest note (bass) differs from the root, returns a slash chord.
// Returns { name: string, root: number, quality: string, bass: number|null } or null
export function notesToChord(noteSet) {
  if (!noteSet || noteSet.size < 2) return null

  const notes = Array.from(noteSet).sort((a, b) => a - b)
  const bassNote = notes[0]

  let best = null

  for (const candidateRoot of notes) {
    // Compute intervals from this candidate root (mod 12, but keep compound info)
    const intervals = []
    for (const n of notes) {
      let iv = (n - candidateRoot + 12) % 12
      // Handle compound intervals: if we have notes spanning > 12 semitones
      // we need to check both simple and compound
      intervals.push(iv)
    }
    const uniqueIntervals = new Set(intervals)

    for (const [quality, expectedIntervals] of Object.entries(QUALITY_INTERVALS)) {
      const expectedSimple = expectedIntervals.map(iv => iv % 12)
      const expectedSet = new Set(expectedSimple)

      // Score: how many expected intervals are present
      let matchCount = 0
      for (const e of expectedSimple) {
        if (uniqueIntervals.has(e)) matchCount++
      }

      // Penalty: extra notes not in the expected set
      let extraCount = 0
      for (const u of uniqueIntervals) {
        if (!expectedSet.has(u)) extraCount++
      }

      const score = matchCount - extraCount * 0.5
      const coverage = matchCount / expectedSimple.length

      if (coverage < 0.7) continue

      if (!best || score > best.score || (score === best.score && coverage > best.coverage)) {
        best = {
          score,
          coverage,
          root: candidateRoot,
          quality,
          expectedIntervals,
        }
      }
    }
  }

  if (!best) return null

  const rootName = NOTE_NAMES[best.root]
  let chordName = rootName + best.quality

  // If bass note differs from root, add slash
  if (bassNote !== best.root) {
    const bassName = NOTE_NAMES[bassNote]
    chordName += '/' + bassName
  }

  return {
    name: chordName,
    root: best.root,
    quality: best.quality,
    bass: bassNote !== best.root ? bassNote : null,
  }
}

export function getQualityIntervals(quality) {
  return QUALITY_INTERVALS[quality] || null
}

export function getAllQualities() {
  return Object.keys(QUALITY_INTERVALS)
}

export { OPEN_STRINGS, NOTE_NAMES, QUALITY_INTERVALS }
