import { OPEN_STRINGS } from './chordNotes.js'

const NUM_STRINGS = 6
const MAX_FRETS = 15
const MAX_STRETCH = 5
const MIN_STRINGS = 3
const MAX_RESULTS = 6

function noteAt(stringIndex, fret) {
  return (OPEN_STRINGS[stringIndex] + fret) % 12
}

// For a given set of chord notes, find which frets on each string produce those notes.
// Returns array of arrays: for each string, list of valid frets (0..MAX_FRETS)
function getStringFrets(chordNotes, maxFret = MAX_FRETS) {
  const result = []
  for (let s = 0; s < NUM_STRINGS; s++) {
    const valid = []
    for (let f = 0; f <= maxFret; f++) {
      if (chordNotes.has(noteAt(s, f))) {
        valid.push(f)
      }
    }
    result.push(valid)
  }
  return result
}

// Score a fingering. Lower = better.
function scoreFingering(frets, chordNotes, bassNote) {
  const sounding = frets.filter(f => f >= 0)
  if (sounding.length < MIN_STRINGS) return Infinity

  // Check all chord notes are covered (allow partial for chords with > 6 notes)
  const coveredNotes = new Set()
  for (let s = 0; s < NUM_STRINGS; s++) {
    if (frets[s] >= 0) coveredNotes.add(noteAt(s, frets[s]))
  }
  const allCovered = [...chordNotes].every(n => coveredNotes.has(n))
  if (!allCovered && chordNotes.size <= NUM_STRINGS) return Infinity
  if (!allCovered && chordNotes.size > NUM_STRINGS) {
    // Partial voicing: require at least 4 of the chord notes
    if (coveredNotes.size < 4) return Infinity
  }

  // Bass constraint: lowest sounding string must play bass note
  if (bassNote !== null && bassNote !== undefined) {
    for (let s = 0; s < NUM_STRINGS; s++) {
      if (frets[s] >= 0) {
        if (noteAt(s, frets[s]) !== bassNote) return Infinity
        break
      }
    }
  }

  const minFret = Math.min(...sounding)
  const maxFret = Math.max(...sounding)
  const stretch = maxFret - minFret

  if (stretch > MAX_STRETCH) return Infinity

  let score = 0

  // Stretch penalty
  score += Math.max(0, stretch - 3) * 3

  // Partial voicing penalty
  const missingNotes = [...chordNotes].filter(n => !coveredNotes.has(n)).length
  score += missingNotes * 5

  // Prefer fewer fingers (distinct fret positions, excluding open strings)
  const usedFrets = new Set(sounding.filter(f => f > 0))
  score += usedFrets.size * 2

  // Open string bonus (only if the open note is in the chord)
  const openCount = sounding.filter(f => f === 0).length
  score -= openCount * 1

  // Barre penalty: if same fret on 3+ strings
  const fretCounts = {}
  for (const f of sounding) {
    if (f > 0) fretCounts[f] = (fretCounts[f] || 0) + 1
  }
  for (const count of Object.values(fretCounts)) {
    if (count >= 3) score += (count - 2) * 4
  }

  // Prefer lower positions (open chords are easier)
  score += minFret * 1.5

  // Prefer more strings sounding (fuller sound)
  score -= sounding.length * 1

  return score
}

// Recursively find fingerings for a given window of frets.
function searchFingerings(stringFrets, chordNotes, bassNote, windowStart, windowEnd) {
  const results = []
  const current = new Array(NUM_STRINGS).fill(-1)

  function backtrack(stringIdx) {
    if (stringIdx === NUM_STRINGS) {
      const s = scoreFingering(current, chordNotes, bassNote)
      if (s < Infinity) {
        results.push({ frets: [...current], score: s })
      }
      return
    }

    const validFrets = stringFrets[stringIdx].filter(
      f => f === 0 || (f >= windowStart && f <= windowEnd)
    )

    // Option 1: mute this string
    current[stringIdx] = -1
    backtrack(stringIdx + 1)

    // Option 2: play a valid fret
    for (const f of validFrets) {
      current[stringIdx] = f
      backtrack(stringIdx + 1)
    }

    current[stringIdx] = -1
  }

  backtrack(0)
  return results
}

// Main function: find best fingerings for a chord.
// chordNotes: Set of semitone numbers
// bassNote: semitone number or null (for slash chords)
// Returns array of { frets: number[], startFret: number } sorted by playability
export function findFingerings(chordNotes, bassNote = null) {
  if (!chordNotes || chordNotes.size < 2) return []

  const allResults = []
  const maxWindowStart = 12

  // Try different position windows
  for (let windowStart = 0; windowStart <= maxWindowStart; windowStart++) {
    const windowEnd = windowStart + MAX_STRETCH
    const stringFrets = getStringFrets(chordNotes, windowEnd)

    // Quick check: does every string have at least one option in this window?
    // (Not required — strings can be muted — but if too few options, skip)
    const totalOptions = stringFrets.reduce((sum, arr) => {
      return sum + arr.filter(f => f === 0 || (f >= windowStart && f <= windowEnd)).length + 1
    }, 0)
    if (totalOptions < 8) continue

    const results = searchFingerings(stringFrets, chordNotes, bassNote, windowStart, windowEnd)
    for (const r of results) {
      allResults.push(r)
    }
  }

  // Sort by score, deduplicate, take top results
  allResults.sort((a, b) => a.score - b.score)

  const seen = new Set()
  const unique = []
  for (const r of allResults) {
    const key = r.frets.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
    if (unique.length >= MAX_RESULTS) break
  }

  // Compute startFret for each
  return unique.map(r => {
    const sounding = r.frets.filter(f => f > 0)
    const minFret = sounding.length ? Math.min(...sounding) : 1
    const startFret = minFret <= 1 ? 1 : minFret
    return { frets: r.frets, startFret }
  })
}

// Check if any fingerings exist for a chord
export function hasFingerings(chordNotes, bassNote = null) {
  return findFingerings(chordNotes, bassNote).length > 0
}
