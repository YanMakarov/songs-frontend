// Collapse consecutive lines with identical chord sequences into one row + "×N" for chords-only view.

export function chordSequence(line) {
  return [...line.chords]
    .sort((a, b) => a.position - b.position)
    .map((c) => c.chord)
}

function sequencesEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// Returns array of { sequence: string[], count: number, key: string }
export function collapseRepeats(lines) {
  const seqs = lines.map(chordSequence)
  const groups = []
  let i = 0
  while (i < seqs.length) {
    const seq = seqs[i]
    let count = 1
    while (i + count < seqs.length && sequencesEqual(seqs[i + count], seq) && seq.length > 0) {
      count += 1
    }
    groups.push({ sequence: seq, count, key: lines[i].id })
    i += count
  }
  return groups
}
