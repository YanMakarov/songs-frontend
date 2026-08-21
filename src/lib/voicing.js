// Compact persistence format for a fingering: 6 hex-ish chars, one per string
// (low E, A, D, G, B, high e), 'x' for a muted string, otherwise the fret
// number in base16 (0-9, a-f — covers frets 0..15, which is already the
// search ceiling used elsewhere). Kept deliberately simple so it round-trips
// through the markdown song format as a plain token suffix ("Em7:020000").
const NUM_STRINGS = 6

export function encodeVoicing(frets) {
  if (!frets || frets.length !== NUM_STRINGS) return null
  return frets.map((f) => (f === -1 ? 'x' : f.toString(16))).join('')
}

export function decodeVoicing(code) {
  if (!code || code.length !== NUM_STRINGS) return null
  const frets = []
  for (const ch of code) {
    if (ch === 'x') {
      frets.push(-1)
      continue
    }
    const f = parseInt(ch, 16)
    if (Number.isNaN(f)) return null
    frets.push(f)
  }
  return frets
}

// Scale-degree label relative to the chord root, for display inside a dot.
const DEGREE_LABELS = ['R', 'b9', '9', 'b3', '3', '11', 'b5', '5', '#5', '6', 'b7', '7']

export function degreeLabel(semitonesFromRoot) {
  return DEGREE_LABELS[((semitonesFromRoot % 12) + 12) % 12]
}

// A barre is drawn explicitly for curated shapes (the data says where it is).
// For algorithmically-found shapes we don't have that ground truth, so this
// heuristic infers one: the lowest fretted position repeating on 3+ strings
// (chord charts don't draw a bar for just 2 — that reads as two separate
// fingers that happen to share a fret) with nothing open in between — a
// barre finger blocks every string it crosses, so an open string can't ring
// "behind" it. Without that check, two coincidentally same-fret notes on
// opposite sides of the neck could get rendered as one impossible barre
// spanning open strings in between.
export function detectBarre(frets) {
  const sounding = frets
    .map((f, i) => ({ f, i }))
    .filter((x) => x.f > 0)
  if (sounding.length < 3) return null
  const minFret = Math.min(...sounding.map((x) => x.f))
  const atMin = sounding.filter((x) => x.f === minFret)
  if (atMin.length < 3) return null
  const from = atMin[0].i
  const to = atMin[atMin.length - 1].i
  for (let i = from; i <= to; i++) {
    if (frets[i] === 0) return null
  }
  return { fret: minFret, from, to }
}

export function computeStartFret(frets) {
  // Any open string anchors the diagram at the nut — an open string can only
  // ring "from fret 0", so the chord can never be shown starting higher up,
  // no matter how high its fretted notes go (e.g. A7 = x02020 is an open
  // chord, not a fret-2 position, even though nothing is fretted below 2).
  if (frets.includes(0)) return 1
  const sounding = frets.filter((f) => f > 0)
  if (!sounding.length) return 1
  const minFret = Math.min(...sounding)
  return minFret <= 1 ? 1 : minFret
}
