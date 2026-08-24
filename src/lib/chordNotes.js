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
  '7b5':    [0, 4, 6, 10],
  '5':      [0, 7],
  '11':     [0, 4, 7, 10, 14, 17],
  'm11':    [0, 3, 7, 10, 14, 17],
  'maj11':  [0, 4, 7, 11, 14, 17],
  '13':     [0, 4, 7, 10, 14, 17, 21],
  'm13':    [0, 3, 7, 10, 14, 17, 21],
  'maj13':  [0, 4, 7, 11, 14, 17, 21],
  '69':     [0, 4, 7, 9, 14],
  'm69':    [0, 3, 7, 9, 14],

  // Altered and Lydian colours. Deliberately last: candidate ranking walks
  // this object in declaration order and, all else equal, keeps the quality
  // it saw first — so the plain names still win the ties they won before
  // these arrived.
  'maj7#11': [0, 4, 7, 11, 18],
  'maj9#11': [0, 4, 7, 11, 14, 18],
  '7#11':    [0, 4, 7, 10, 18],
  '9#11':    [0, 4, 7, 10, 14, 18],
  'm(maj7)': [0, 3, 7, 11],
  '7b9':     [0, 4, 7, 10, 13],
  '7#9':     [0, 4, 7, 10, 15],
  '7#5':     [0, 4, 8, 10],
}

// The same chord gets written a dozen ways, and a song imported from
// anywhere is full of them. Every alias resolves to a key above; a suffix
// that isn't listed is looked up exactly as typed. Case is meaningful here
// ("M" is major, "m" is minor), so nothing gets lowercased.
const QUALITY_ALIASES = {
  'M': '', 'maj': '', 'major': '',
  'min': 'm', 'mi': 'm', '-': 'm',
  'M7': 'maj7', 'Ma7': 'maj7', 'ma7': 'maj7', '\u0394': 'maj7', '\u03947': 'maj7',
  'M9': 'maj9', '\u03949': 'maj9',
  'min6': 'm6', 'min7': 'm7', 'min9': 'm9', '-7': 'm7', '-9': 'm9',
  'mmaj7': 'm(maj7)', 'mMaj7': 'm(maj7)', 'mM7': 'm(maj7)', 'minmaj7': 'm(maj7)',
  'M7#11': 'maj7#11', 'maj7+11': 'maj7#11', '\u0394#11': 'maj7#11', '\u03947#11': 'maj7#11',
  'M9#11': 'maj9#11', 'maj9+11': 'maj9#11',
  '7+11': '7#11', '9+11': '9#11',
  '+': 'aug', '+5': 'aug', '#5': 'aug', 'aug5': 'aug',
  'o': 'dim', '\u00b0': 'dim', 'o7': 'dim7', '\u00b07': 'dim7',
  '\u00f8': 'm7b5', '\u00f87': 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5', 'halfdim': 'm7b5',
  '7-5': '7b5', '7+5': '7#5', '7aug5': '7#5', '7-9': '7b9', '7+9': '7#9',
  '6/9': '69', 'M6': '6', 'sus': 'sus4', '7sus': '7sus4',
  'add2': 'add9', 'madd2': 'madd9',
}

// "Cmaj7(#11)" and "Cmaj7#11" are the same chord; so are "C m7" and "Cm7".
export function normalizeQuality(suffix) {
  const s = (suffix || '').replace(/[()\s]/g, '')
  if (Object.prototype.hasOwnProperty.call(QUALITY_INTERVALS, s)) return s
  return Object.prototype.hasOwnProperty.call(QUALITY_ALIASES, s) ? QUALITY_ALIASES[s] : s
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
  // "C6/9" is a quality spelled with a slash, not a chord over a bass note —
  // split only when what follows the slash actually names a note.
  if (slashIdx !== -1 && normalizeNote(raw.slice(slashIdx + 1)) !== null) {
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

  const quality = normalizeQuality(suffix)
  const intervals = QUALITY_INTERVALS[quality]
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

  return { notes, root: rootSemitone, bass: bassSemitone, quality, rootName: root }
}

// Chord tones a voicing may leave out and still be the chord it claims.
// Six strings can't carry a five- or six-note chord and stay playable, and
// the guitar's answer has always been to drop the perfect fifth first (it
// says nothing the root doesn't already say), then — from a 9th upward — the
// third, which is why "x3543x" is played and named Cmaj9 even without an E.
// The 11th goes too in a 13th chord. Triads and sevenths have nothing to
// spare: every note is load-bearing.
export function omissibleIntervals(qualityIntervals) {
  const simple = qualityIntervals.map((iv) => ((iv % 12) + 12) % 12)
  const distinct = new Set(simple)
  if (distinct.size < 4) return new Set()
  const omissible = new Set()
  if (distinct.has(7)) omissible.add(7)
  if (qualityIntervals.includes(21) && qualityIntervals.includes(17)) omissible.add(5)
  // ...but only where dropping it leaves the chord recognisable. An altered
  // dominant whose colour tone lands on the third's own step (the #9 of 7#9
  // sits a minor third above the root) has nothing left to say without it:
  // drop the major third and A7#9 is just Am7, which is how a plain Am7 grip
  // used to outrank the reading the user actually meant.
  if (distinct.size >= 5 && !(distinct.has(3) && distinct.has(4))) {
    if (distinct.has(4)) omissible.add(4)
    else if (distinct.has(3)) omissible.add(3)
  }
  return omissible
}

// May a voicing leave out the root itself? Only when something other than the
// notes says which chord this is — the caller passes `rootKnown` when it has
// a declared root rather than one guessed at from the notes (a saved shape
// knows its own root string; a user picking a reading has just named one).
// Even then, two conditions: the chord is an extended one, where rootless
// grips are how it is actually played on six strings, and the third and the
// seventh are both sounding. That shell is what carries the identity — drop
// it as well and any two colour tones would "fit" half the catalogue.
function rootOmissible(targetSet, intervalSet) {
  if (targetSet.size < 5) return false
  const third = targetSet.has(4) ? 4 : targetSet.has(3) ? 3 : null
  const seventh = targetSet.has(11) ? 11 : targetSet.has(10) ? 10 : null
  if (third === null || seventh === null) return false
  return intervalSet.has(third) && intervalSet.has(seventh)
}

// Does a set of intervals (0-11, relative to the root) play as this quality?
// The single answer to "is this that chord", shared by the shape matcher and
// by note-set detection — when they each had their own idea of it, the editor
// would name a shape maj9 and the library would then refuse to file it there.
// The shape matcher is the more permissive of the two only in one direction
// (it knows its root, so it accepts rootless voicings), which keeps that
// failure impossible: anything detection names, the library still files.
//
// `fits`  — nothing foreign sounds, and every tone the chord can't do without
//           is present. `exact` — on top of that, nothing at all is missing.
//
// bassInterval: the bass the caller asked for, as an interval from the root.
// "Am/G" is a request for a G under an A minor triad, so that G is not a
// foreign note here — without this, no shape could ever play a slash chord
// whose bass is outside the triad (Am/G, Am/F#, C/B...).
export function chordFitsIntervals(intervalSet, qualityIntervals, { rootKnown = false, bassInterval = null } = {}) {
  const targetSet = new Set(qualityIntervals.map((iv) => ((iv % 12) + 12) % 12))
  const omissible = omissibleIntervals(qualityIntervals)
  if (rootKnown && rootOmissible(targetSet, intervalSet)) omissible.add(0)

  for (const iv of intervalSet) {
    if (!targetSet.has(iv) && iv !== bassInterval) return { fits: false, exact: false }
  }

  let missingAny = false
  for (const iv of targetSet) {
    if (intervalSet.has(iv)) continue
    missingAny = true
    if (!omissible.has(iv)) return { fits: false, exact: false }
  }

  return { fits: true, exact: !missingAny }
}

// Given a set of note semitones, rank the chords those notes could be.
// A pitch-class set is not a chord: E-F#-B is Esus2, Bsus4 and a rootless
// Cmaj7#11 all at once, and only context — or a person — can say which is
// meant. So this returns every reading it finds, best first, and lets the
// caller decide how many to show.
//
// explicitBass: pass the note actually played on the lowest string, when
// known (e.g. from a fretboard shape) — a Set has no ordering, so without it
// the bass would have to be guessed as "smallest semitone number", which is
// not the same thing as "lowest-pitched note" and produces wrong slash chords.
//
// includeRootless: also try the roots the notes don't sound. Rootless grips
// are how extended chords are really voiced on six strings, but nothing in
// the notes points at them, so they rank below every reading that does sound
// its root and are only worth offering where the user can confirm the choice.
//
// Each candidate: { name, root, quality, bass, fits, exact, rootless }
export function notesToChordCandidates(noteSet, explicitBass = null, { includeRootless = false } = {}) {
  if (!noteSet || noteSet.size < 2) return []

  const notes = Array.from(noteSet).sort((a, b) => a - b)
  const knownBass = explicitBass !== null && noteSet.has(explicitBass) ? explicitBass : null
  const bassNote = knownBass !== null ? knownBass : notes[0]

  const roots = includeRootless ? Array.from({ length: 12 }, (_, i) => i) : notes
  const scored = rankReadings(notes, roots)

  // A bass note the chord above it doesn't contain is its own reading:
  // A-C-E over G is "Am/G", not a C6 in disguise, and A-C-E over F# is
  // "Am/F#" as readily as it is F#m7b5. Neither shows up above, where every
  // note has to belong to one stack, so the upper structure is named on its
  // own and the bass hung under it. Only complete triads and sevenths above
  // (an incomplete one over a foreign bass is a guess, not a chord).
  if (knownBass !== null) {
    const upper = notes.filter((n) => n !== knownBass)
    if (upper.length >= 3) {
      for (const r of rankReadings(upper, upper)) {
        if (r.fits && r.exact) scored.push({ ...r, pedal: true })
      }
    }
  }

  // Readings that sound their root first, then a chord over a foreign bass,
  // then rootless ones, then the best-effort near misses. Ties keep the order
  // they were found in — roots low to high, qualities in catalogue order — so
  // the plain names stay put.
  const rank = (c) => (c.pedal ? 2 : c.fits ? (c.rootless ? 1 : 3) : 0)
  scored.sort((a, b) => rank(b) - rank(a) || b.score - a.score || b.coverage - a.coverage)

  return scored.flatMap((c) => {
    // A rootless reading has no root to be an inversion of — naming the
    // lowest note as a slash bass there would assert a bass degree of a chord
    // whose root isn't in the room.
    const bass = c.pedal || (!c.rootless && bassNote !== c.root) ? bassNote : null
    const reading = {
      name: NOTE_NAMES[c.root] + c.quality + (bass !== null ? '/' + NOTE_NAMES[bass] : ''),
      root: c.root,
      quality: c.quality,
      bass,
      fits: c.fits,
      exact: c.exact,
      rootless: !!c.rootless,
      pedal: !!c.pedal,
    }
    // The same reading without the slash. Which note ended up lowest in a
    // voicing isn't always a claim about the bass — an Am7 grip with the G at
    // the bottom is usually still just "Am7", and filing it as Am7/G would
    // then demand that bass of every shape shown under it. Both are offered;
    // the user says which was meant. Not for a bass the chord above it does
    // not contain: dropping the slash from "Am/G" loses the G outright.
    if (!c.fits || c.pedal || reading.bass === null) return [reading]
    return [reading, { ...reading, name: NOTE_NAMES[c.root] + c.quality, bass: null }]
  })
}

// Every (root, quality) the given notes could spell, scored but not yet named.
// `roots` may include notes that don't sound — those come back flagged
// `rootless`, since nothing in the notes themselves points at them.
function rankReadings(notes, roots) {
  const soundingSet = new Set(notes)
  const out = []

  for (const candidateRoot of roots) {
    const uniqueIntervals = new Set(notes.map((n) => ((n - candidateRoot) % 12 + 12) % 12))
    const rootSounds = soundingSet.has(candidateRoot)

    for (const [quality, expectedIntervals] of Object.entries(QUALITY_INTERVALS)) {
      const expectedSimple = expectedIntervals.map((iv) => ((iv % 12) + 12) % 12)
      const expectedSet = new Set(expectedSimple)

      // The one authority on "these notes are that chord" (shapeMatch.js asks
      // it too). Every root offered here is declared rather than inferred — it
      // either sounds, or it is a reading the user has to pick — so the
      // rootless allowance applies.
      const { fits, exact } = chordFitsIntervals(uniqueIntervals, expectedIntervals, { rootKnown: true })

      // Best-effort naming is for notes that at least state their own root;
      // a root nobody plays has to earn its place by fitting properly.
      if (!rootSounds && !fits) continue

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

      // A near miss still needs to be near. A chord that fits is never a miss,
      // and can sit below this line legitimately: a 13th voicing that drops
      // every omissible tone covers barely half its own interval list.
      if (!fits && coverage < 0.7) continue

      out.push({ root: candidateRoot, quality, fits, exact, rootless: !rootSounds, score, coverage })
    }
  }

  return out
}

// The single best reading — for callers with no way to ask which one is meant.
// Returns { name, root, quality, bass, ... } or null.
export function notesToChord(noteSet, explicitBass = null) {
  const [best] = notesToChordCandidates(noteSet, explicitBass)
  return best || null
}

export function getQualityIntervals(quality) {
  return QUALITY_INTERVALS[normalizeQuality(quality)] || null
}

export function getAllQualities() {
  return Object.keys(QUALITY_INTERVALS)
}

export { OPEN_STRINGS, NOTE_NAMES, QUALITY_INTERVALS }
