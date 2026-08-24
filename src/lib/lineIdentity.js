// Keeping line and chord ids stable across a refetch.
//
// The server does not store them. A song's body lives as markdown
// (`Song.markdown_body`), and every read parses it afresh — `_to_detail` calls
// `markdown_to_lines`, which mints a fresh `generate_public_id()` for every
// line and every chord. Two GETs of a song nobody touched come back with
// entirely different ids.
//
// Downstream those ids are identity in two load-bearing places:
//
//   * `<Line key={line.id}>`. New ids unmount and remount every row, which
//     destroys the focused <textarea> — on a phone that collapses the
//     on-screen keyboard mid-word and drops the uncommitted draft with it.
//   * Open popovers hold ids captured when they opened: `picker.lineId`,
//     `chordMenu.chordId`, `fingeringTarget.lineId`. Once those go stale the
//     lookups in SongEditor find nothing and the handlers bail — the chord
//     picker closes without saving what was typed, the fingering modal stays
//     open with cards that no longer do anything. Both are silent.
//
// Neither is something the user can see coming: the refetch that breaks them
// runs on a timer (sync.js) or on window focus while they are still deciding
// what to type. So instead of taking the server's ids, re-attach the ones we
// already had. The client owns them outright — `lines_to_markdown` drops ids
// on the way in, so nothing kept here can disagree with anything stored.

//: Above this the LCS table stops being worth allocating. A song is tens of
//: lines; a paste of something enormous is not impossible, and it is the
//: table, not the loop, that would hurt.
const MAX_DIFF_CELLS = 1_000_000

//: Separators that cannot occur inside a chord symbol, a label or lyrics, so
//: two different lines can never collapse to the same signature.
const FIELD_SEP = '\u0000'
const CHORD_SEP = '\u0001'

function chordSignature(chord) {
  return [chord?.position ?? 0, chord?.chord ?? '', chord?.voicing ?? ''].join(FIELD_SEP)
}

function lineSignature(line) {
  return [
    line?.type ?? 'line',
    line?.lyrics ?? '',
    line?.label ?? '',
    line?.key ?? '',
    line?.repeatCount ?? '',
    (line?.chords || []).map(chordSignature).join(CHORD_SEP),
  ].join(FIELD_SEP)
}

/**
 * A longest common subsequence of two signature arrays, as [prev, next] index
 * pairs.
 *
 * Matching by position alone would be wrong the moment a line is inserted or
 * deleted: everything below it shifts by one and every id below it changes,
 * which is the same remount this module exists to prevent. The LCS gives the
 * lines we are certain about; what sits between two of them is the edit.
 */
function commonSubsequence(prevSigs, nextSigs) {
  const n = prevSigs.length
  const m = nextSigs.length
  if (!n || !m) return []
  if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) {
    const pairs = []
    for (let i = 0; i < Math.min(n, m); i += 1) {
      if (prevSigs[i] === nextSigs[i]) pairs.push([i, i])
    }
    return pairs
  }

  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        prevSigs[i] === nextSigs[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  const pairs = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (prevSigs[i] === nextSigs[j]) {
      pairs.push([i, j])
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

/**
 * Pair off the lines in one gap between two anchors — the ones whose content
 * actually differs.
 *
 * The row the caret sits in is exactly such a line: its text no longer matches
 * anything the server has, and it is the one row whose id must not change.
 * Matched by type and by how far each sits into its own run, so an edit keeps
 * its place while an insertion above it does not steal its id.
 */
function pairRun(prevLines, nextLines, matches, prevStart, prevEnd, nextStart, nextEnd) {
  const taken = new Set()
  for (let j = nextStart; j < nextEnd; j += 1) {
    const offset = j - nextStart
    let best = -1
    let bestDistance = Infinity
    for (let i = prevStart; i < prevEnd; i += 1) {
      if (taken.has(i)) continue
      if (prevLines[i].type !== nextLines[j].type) continue
      const distance = Math.abs(i - prevStart - offset)
      if (distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    }
    if (best === -1) continue
    matches[j] = best
    taken.add(best)
  }
}

/**
 * Last pass: a line that is unchanged but has moved.
 *
 * The anchors walk both lists forward, so a line that jumped backwards past
 * one of them is stepped over and never offered to the runs on either side —
 * a plain swap of two rows would drop both ids. Here whatever is still
 * unclaimed on both sides is matched by exact content, nearest first, which
 * costs nothing once the common case has already been settled above.
 */
function claimMovedLines(prevSigs, nextSigs, matches) {
  const claimed = new Set(matches.filter((at) => at !== -1))
  const free = new Map()
  for (let i = 0; i < prevSigs.length; i += 1) {
    if (claimed.has(i)) continue
    const bucket = free.get(prevSigs[i])
    if (bucket) bucket.push(i)
    else free.set(prevSigs[i], [i])
  }
  if (!free.size) return

  for (let j = 0; j < nextSigs.length; j += 1) {
    if (matches[j] !== -1) continue
    const bucket = free.get(nextSigs[j])
    if (!bucket || !bucket.length) continue
    let pick = 0
    for (let k = 1; k < bucket.length; k += 1) {
      if (Math.abs(bucket[k] - j) < Math.abs(bucket[pick] - j)) pick = k
    }
    matches[j] = bucket[pick]
    bucket.splice(pick, 1)
  }
}

/**
 * Re-attach the previous ids to a freshly fetched chord list.
 *
 * Two rounds: the same chord in the same slot, then whatever merely occupies
 * that slot. The second round is what keeps a chord's id while its symbol is
 * being retyped — the open picker is holding that id.
 */
function reuseChordIds(prevChords, nextChords) {
  if (!Array.isArray(nextChords) || !nextChords.length) return nextChords
  if (!Array.isArray(prevChords) || !prevChords.length) return nextChords

  const prevSigs = prevChords.map(chordSignature)
  const nextSigs = nextChords.map(chordSignature)
  const matches = new Array(nextChords.length).fill(-1)
  const taken = new Set()

  for (let j = 0; j < nextChords.length; j += 1) {
    let best = -1
    let bestDistance = Infinity
    for (let i = 0; i < prevChords.length; i += 1) {
      if (taken.has(i) || prevSigs[i] !== nextSigs[j]) continue
      const distance = Math.abs(i - j)
      if (distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    }
    if (best === -1) continue
    matches[j] = best
    taken.add(best)
  }

  for (let j = 0; j < nextChords.length; j += 1) {
    if (matches[j] !== -1) continue
    const at = prevChords.findIndex(
      (chord, i) => !taken.has(i) && chord.position === nextChords[j].position,
    )
    if (at === -1) continue
    matches[j] = at
    taken.add(at)
  }

  let reusedAll = prevChords.length === nextChords.length
  const result = nextChords.map((chord, j) => {
    const at = matches[j]
    if (at === -1) {
      reusedAll = false
      return chord
    }
    if (at !== j) reusedAll = false
    const prev = prevChords[at]
    if (prevSigs[at] === nextSigs[j]) return prev
    reusedAll = false
    return { ...chord, id: prev.id }
  })
  return reusedAll ? prevChords : result
}

/**
 * Re-attach the previous ids to a freshly fetched line list.
 *
 * Where the content is identical the previous object is returned as-is rather
 * than a copy of it: a refetch that changed nothing then leaves every `line`
 * prop referentially equal, and React has nothing to reconcile at all.
 *
 * @param {Array|undefined} prevLines lines currently in the cache
 * @param {Array|undefined} nextLines lines as the server just sent them
 */
export function reuseLineIds(prevLines, nextLines) {
  if (!Array.isArray(nextLines) || !nextLines.length) return nextLines
  if (!Array.isArray(prevLines) || !prevLines.length) return nextLines

  const prevSigs = prevLines.map(lineSignature)
  const nextSigs = nextLines.map(lineSignature)
  const matches = new Array(nextLines.length).fill(-1)

  const anchors = commonSubsequence(prevSigs, nextSigs)
  for (const [p, q] of anchors) matches[q] = p

  let prevCursor = 0
  let nextCursor = 0
  for (const [p, q] of anchors) {
    pairRun(prevLines, nextLines, matches, prevCursor, p, nextCursor, q)
    prevCursor = p + 1
    nextCursor = q + 1
  }
  pairRun(prevLines, nextLines, matches, prevCursor, prevLines.length, nextCursor, nextLines.length)
  claimMovedLines(prevSigs, nextSigs, matches)

  let reusedAll = prevLines.length === nextLines.length
  const result = nextLines.map((line, j) => {
    const at = matches[j]
    if (at === -1) {
      reusedAll = false
      return line
    }
    if (at !== j) reusedAll = false
    const prev = prevLines[at]
    if (prevSigs[at] === nextSigs[j]) return prev
    reusedAll = false
    return { ...line, id: prev.id, chords: reuseChordIds(prev.chords, line.chords) }
  })
  return reusedAll ? prevLines : result
}
