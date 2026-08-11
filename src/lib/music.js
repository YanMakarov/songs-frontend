// Music theory helpers: note math, transposition, diatonic chords, chord catalogue.

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Keys that conventionally use flats (major tonic names + their relative minors).
const FLAT_KEY_TONICS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'D', 'G', 'C'])
// D, G, C minor use flats too (Dm, Gm, Cm -> relative majors F, Bb, Eb are flat keys)

const NOTE_TO_SEMITONE = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

export function noteToSemitone(note) {
  return NOTE_TO_SEMITONE[note] ?? null
}

export function semitoneToNote(semitone, preferFlat) {
  const n = ((semitone % 12) + 12) % 12
  return preferFlat ? FLAT_NAMES[n] : SHARP_NAMES[n]
}

// Parse a key label like "C", "Am", "F#", "Bbm", "G#m" into { tonic, mode, preferFlat }
export function parseKey(keyLabel) {
  const raw = (keyLabel || '').trim()
  const m = raw.match(/^([A-Ga-g])([#b]?)(m)?$/)
  if (!m) {
    return { tonic: raw || 'C', mode: 'major', preferFlat: false, valid: false }
  }
  const letter = m[1].toUpperCase()
  const accidental = m[2] || ''
  const mode = m[3] ? 'minor' : 'major'
  const tonic = letter + accidental
  const preferFlat = accidental === 'b' || FLAT_KEY_TONICS.has(tonic) || (mode === 'minor' && FLAT_KEY_TONICS.has(tonic))
  return { tonic, mode, preferFlat, valid: true }
}

// Parse a chord string like "Bbm7" into { root, suffix }
export function parseChord(chord) {
  const raw = normalizeChordText(chord)
  const m = raw.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!m) return { root: null, suffix: raw }
  const root = m[1].toUpperCase() + (m[2] || '')
  const suffix = m[3] || ''
  return { root, suffix }
}

// Some PDFs/OCR tools produce Cyrillic look-alike letters instead of the
// Latin note names (e.g. "С" U+0421 instead of "C"). Normalize just the
// leading root letter so chord parsing still works.
const CYRILLIC_ROOT_LOOKALIKES = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
  а: 'a', в: 'b', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p', т: 't', х: 'x',
}

export function normalizeChordText(chord) {
  const raw = (chord || '').trim()
  if (!raw) return raw
  const first = CYRILLIC_ROOT_LOOKALIKES[raw[0]]
  return first ? first + raw.slice(1) : raw
}

export function transposeChord(chord, semitones, preferFlat) {
  if (!semitones) return chord
  const raw = normalizeChordText(chord)
  const slashIdx = raw.indexOf('/')
  if (slashIdx !== -1) {
    const main = raw.slice(0, slashIdx)
    const bass = raw.slice(slashIdx + 1)
    return `${transposeChord(main, semitones, preferFlat)}/${transposeChord(bass, semitones, preferFlat)}`
  }
  const { root, suffix } = parseChord(raw)
  if (root == null) return chord
  const st = noteToSemitone(root)
  if (st == null) return chord
  const newRoot = semitoneToNote(st + semitones, preferFlat)
  return newRoot + suffix
}

export function transposeKey(keyLabel, semitones) {
  if (!semitones) return keyLabel
  const { tonic, mode, valid } = parseKey(keyLabel)
  if (!valid) return keyLabel
  const st = noteToSemitone(tonic)
  if (st == null) return keyLabel
  const newSemitone = ((st + semitones) % 12 + 12) % 12
  const newPreferFlat = FLAT_KEY_TONICS.has(SHARP_NAMES[newSemitone]) || FLAT_KEY_TONICS.has(FLAT_NAMES[newSemitone])
  const newTonic = semitoneToNote(newSemitone, newPreferFlat)
  return mode === 'minor' ? newTonic + 'm' : newTonic
}

export function keySemitoneDelta(fromKey, toKey) {
  const from = parseKey(fromKey)
  const to = parseKey(toKey)
  if (!from.valid || !to.valid) return null
  if (from.mode !== to.mode) return null
  const fromSemitone = noteToSemitone(from.tonic)
  const toSemitone = noteToSemitone(to.tonic)
  if (fromSemitone == null || toSemitone == null) return null
  let delta = toSemitone - fromSemitone
  if (delta > 6) delta -= 12
  if (delta < -6) delta += 12
  return delta
}

// Diatonic triads for a given key, in scale-degree order.
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim']
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', '']
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]

export function diatonicChords(keyLabel) {
  const { tonic, mode, preferFlat, valid } = parseKey(keyLabel)
  if (!valid) return []
  const tonicSemitone = noteToSemitone(tonic)
  if (tonicSemitone == null) return []
  const steps = mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS
  const qualities = mode === 'minor' ? MINOR_QUALITIES : MAJOR_QUALITIES
  return steps.map((step, i) => semitoneToNote(tonicSemitone + step, preferFlat) + qualities[i])
}

// Broad chord catalogue for autocomplete fallback (root x quality).
const ALL_ROOTS_SHARP = SHARP_NAMES
const ALL_ROOTS_FLAT = FLAT_NAMES
const QUALITIES = [
  '', 'm', '7', 'm7', 'maj7', 'dim', 'aug', 'sus2', 'sus4',
  '6', 'm6', '9', 'm9', 'add9', '7sus4', 'dim7', '5',
]

export function fullChordCatalogue(preferFlat) {
  const roots = preferFlat ? ALL_ROOTS_FLAT : ALL_ROOTS_SHARP
  const list = []
  for (const root of roots) {
    for (const q of QUALITIES) list.push(root + q)
  }
  return list
}

export const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4']

// --- Key detection heuristic -------------------------------------------------

function chordQualityInfo(chordStr) {
  const raw = normalizeChordText(chordStr)
  const slashIdx = raw.indexOf('/')
  const main = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw
  const { root, suffix } = parseChord(main)
  if (root == null) return null
  const semitone = noteToSemitone(root)
  if (semitone == null) return null
  let quality = 'maj'
  if (/^dim/i.test(suffix)) quality = 'dim'
  else if (/^m(?!aj)/i.test(suffix)) quality = 'min'
  return { semitone, quality }
}

function diatonicQualityInfo(keyLabel) {
  return diatonicChords(keyLabel).map((c) => chordQualityInfo(c)).filter(Boolean)
}

// Guess the most likely key for a set of chords by scoring how many are
// diatonic to each of the 24 major/minor keys. Not music-theory-perfect, but
// good enough as an editable starting point after import.
export function detectKey(chordStrings) {
  const observed = (chordStrings || []).map(chordQualityInfo).filter(Boolean)
  if (!observed.length) return null

  let best = null
  for (let semitone = 0; semitone < 12; semitone++) {
    for (const mode of ['major', 'minor']) {
      const tonicLabel = semitoneToNote(semitone, false) + (mode === 'minor' ? 'm' : '')
      const diatonic = diatonicQualityInfo(tonicLabel)
      let score = 0
      for (const obs of observed) {
        if (diatonic.some((d) => d.semitone === obs.semitone && d.quality === obs.quality)) score += 1
      }
      const tonicQuality = mode === 'minor' ? 'min' : 'maj'
      if (observed.some((o) => o.semitone === semitone && o.quality === tonicQuality)) score += 2
      if (observed[0].semitone === semitone && observed[0].quality === tonicQuality) score += 1
      if (mode === 'major') score += 0.1
      if (!best || score > best.score) {
        best = { score, tonicLabel }
      }
    }
  }
  return best ? best.tonicLabel : null
}
