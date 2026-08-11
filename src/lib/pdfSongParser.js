// Classifies raw text lines (extracted from a PDF) into typed song lines:
// section headers, purely-instrumental chord lines, or plain lyrics — plus
// pulls header metadata (title / BPM / time signature) and guesses the key
// per section using a diatonic-matching heuristic.

import { normalizeChordText, detectKey } from './music.js'
import { emptyLine, sectionLine, instrumentalLine, uid } from './storage.js'

function isDecorativeDivider(raw) {
  return !/[A-Za-zА-Яа-яЁё0-9]/.test(raw)
}

// All-caps line (ignoring digits/whitespace/punctuation) with no lowercase
// letters anywhere -> treated as a structural section marker.
function isSectionHeader(raw) {
  const core = raw.replace(/[0-9\s.,:;!?()\-–—•/\\]+/g, '')
  if (!core) return false
  if (/[a-zа-яё]/.test(core)) return false
  return /[A-ZА-ЯЁ]/.test(core)
}

function isChordLikeToken(t) {
  const s = t.trim()
  if (!s) return false
  if (/\s/.test(s)) return false
  if (s === '?' || s === '-' || s === '—' || s === '–') return true
  const normalized = normalizeChordText(s)
  return /^[A-G][#b]?[A-Za-z0-9+°/]*$/.test(normalized)
}

// "Am7 | D | Am7 | D" -> ["Am7","D","Am7","D"]. Returns null if the line
// doesn't look like a pure chord progression. Requires at least one "|" so a
// single capitalised word (e.g. a one-word lyric) is never mistaken for a
// chord. Supports repeat markers like "Bm7 x2" / "Bm7×2".
function tryParseChordsOnlyLine(raw) {
  if (!raw.includes('|')) return null
  const segments = raw.split('|').map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return null
  const tokens = []
  for (const seg of segments) {
    const repMatch = seg.match(/^(.+?)\s*[x×]\s*(\d+)$/i)
    let chordPart = seg
    let repeat = 1
    if (repMatch) {
      chordPart = repMatch[1].trim()
      repeat = parseInt(repMatch[2], 10) || 1
    }
    if (!isChordLikeToken(chordPart)) return null
    const normalized = chordPart === '?' || chordPart === '-' ? chordPart : normalizeChordText(chordPart)
    for (let r = 0; r < repeat; r++) tokens.push(normalized)
  }
  return tokens.length ? tokens : null
}

function extractHeaderMeta(lines) {
  let idx = 0
  while (idx < lines.length && lines[idx] === '') idx++
  let title = null
  if (idx < lines.length) {
    title = lines[idx]
    idx++
  }
  let bpm = null
  let timeSignature = null
  while (idx < lines.length) {
    const line = lines[idx]
    if (line === '') {
      idx++
      continue
    }
    const bpmMatch = line.match(/(\d{2,3})\s*BPM/i)
    const timeMatch = line.match(/(\d{1,2}\s*\/\s*\d{1,2})/)
    if (bpmMatch || timeMatch) {
      if (bpmMatch) bpm = parseInt(bpmMatch[1], 10)
      if (timeMatch) timeSignature = timeMatch[1].replace(/\s+/g, '')
      idx++
      continue
    }
    break
  }
  return { title, bpm, timeSignature, restIndex: idx }
}

function tokenize(lines) {
  const items = []
  for (const raw of lines) {
    if (raw === '' || isDecorativeDivider(raw)) continue
    if (isSectionHeader(raw)) {
      items.push({ type: 'section', label: raw })
      continue
    }
    const chords = tryParseChordsOnlyLine(raw)
    if (chords) {
      items.push({ type: 'chords', chords })
      continue
    }
    items.push({ type: 'text', text: raw })
  }
  return items
}

export function parseSongDocument(rawLines) {
  const lines = (rawLines || []).map((l) => l.trim())
  const { title, bpm, timeSignature, restIndex } = extractHeaderMeta(lines)
  const items = tokenize(lines.slice(restIndex))

  const out = []
  let currentKey = null
  let primaryKey = null

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type === 'section') {
      let j = i + 1
      const bucket = []
      while (j < items.length && items[j].type !== 'section') {
        if (items[j].type === 'chords') bucket.push(...items[j].chords)
        j++
      }
      const detected = bucket.length ? detectKey(bucket) : null
      if (detected && primaryKey == null) primaryKey = detected
      if (detected && detected !== currentKey) {
        out.push(sectionLine(item.label, detected))
        currentKey = detected
      } else {
        out.push(sectionLine(item.label, null))
      }
      continue
    }
    if (item.type === 'chords') {
      const line = instrumentalLine()
      line.chords = item.chords.map((chord, position) => ({ id: uid(), position, chord }))
      out.push(line)
      continue
    }
    const line = emptyLine()
    line.lyrics = item.text
    out.push(line)
  }

  return { title, bpm, timeSignature, primaryKey, lines: out }
}
