import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import MetaBar from './MetaBar.jsx'
import Line from './Line.jsx'
import ChordPicker from './ChordPicker.jsx'
import AddLineMenu from './AddLineMenu.jsx'
import ChordContextMenu from './ChordContextMenu.jsx'
import ChordFingeringModal from './ChordFingeringModal.jsx'
import { IconChevronLeft, IconPlus, IconSettings, IconUpload, IconPrinter, IconMusic } from './Icons.jsx'
import ThemeMenu from './ThemeMenu.jsx'
import Tooltip from './Tooltip.jsx'
import { transposeChord, transposeKey, parseKey, keySemitoneDelta } from '../lib/music.js'
import { decodeVoicing, encodeVoicing } from '../lib/voicing.js'
import { emptyLine, sectionLine, instrumentalLine, pagebreakLine, commentLine, uid, loadLocalSongOverride, saveLocalSongOverride, clearLocalSongOverride, loadShowComments, saveShowComments } from '../lib/storage.js'
import { collapseRepeats } from '../lib/repeats.js'
import PrintPreview from './PrintPreview.jsx'
import SongNotes from './SongNotes.jsx'
import SongTabs from './SongTabs.jsx'
import { ApiError, importPdf } from '../lib/api.js'
import { UNDO_TIMEOUT_MS } from '../lib/undo.js'
import UndoBanner from './UndoBanner.jsx'
import LockButton from './LockButton.jsx'
import LockNotice from './LockNotice.jsx'
import { useLock } from '../lib/useLock.js'
import { readNote } from '../lib/notes.js'
import { isEmptyNotesHtml } from '../lib/notesHtml.js'

const LONG_PRESS_MS = 500
const DBL_TAP_MS = 320

// Whether the primary pointer is coarse (touch). Used only to tailor the
// on-canvas hint text to the gestures available on mobile; desktop behavior
// and hints are unchanged.
const isCoarsePointer =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false
function isPristineEmptyLine(line) {
  if (!line || line.type !== 'line') return false
  const hasLyrics = typeof line.lyrics === 'string' && line.lyrics.trim().length > 0
  const hasChords = Array.isArray(line.chords) && line.chords.length > 0
  return !hasLyrics && !hasChords
}

export default function SongEditor({
  song,
  onChange,
  viewMode,
  onViewModeChange,
  onBack,
  theme,
  onThemeChange,
  textScale,
  onOpenSettings,
  onOpenLibrary,
}) {
  const [picker, setPicker] = useState(null)
  const [addMenu, setAddMenu] = useState(null)
  const [chordMenu, setChordMenu] = useState(null)
  const [fingeringTarget, setFingeringTarget] = useState(null)
  const [charWidth, setCharWidth] = useState(8.6)
  const [drag, setDrag] = useState(null)
  const [lineDrag, setLineDrag] = useState(null)
  const [importing, setImporting] = useState(false)
  const [focusedLineId, setFocusedLineId] = useState(null)
  const [confirmOriginalKey, setConfirmOriginalKey] = useState(false)
  const [localOverride, setLocalOverride] = useState(null)
  const [printPreview, setPrintPreview] = useState(false)
  // Which half of the song screen is showing. Always starts on the harmony:
  // the notes are a side channel, the chords are what the song is for.
  const [tab, setTab] = useState('harmony')
  const [hasNote, setHasNote] = useState(false)
  // Read on mount rather than held in App: the switch is global, and every
  // song screen mounts this component, so localStorage is the single source
  // of truth without another prop having to be threaded through.
  const [showComments, setShowComments] = useState(loadShowComments)
  const locked = useLock()
  const [pendingLineDelete, setPendingLineDelete] = useState(null)
  const [lostEdit, setLostEdit] = useState(null)
  const lostEditTimer = useRef(null)
  const measureRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const pressTimer = useRef(null)
  const longPressFired = useRef(false)
  const dragRef = useRef(null)
  const lineDragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimer = useRef(null)
  const lastEmptyTapAtRef = useRef(0)
  const songRef = useRef(song)
  const onChangeRef = useRef(onChange)
  const charWidthRef = useRef(charWidth)
  const pendingLineDeleteRef = useRef(null)
  const commitPatchRef = useRef(null)
  const appliedTextScale = Number.isFinite(textScale) ? textScale : 1

  // Local transposition override: a per-song copy of { key, lines } kept only
  // in localStorage. While active, the editor shows and edits this copy; the
  // server keeps the original. Flushed to the server only when the user
  // explicitly sets a new original tonality.
  const effectiveSong = useMemo(
    () => (localOverride ? { ...song, key: localOverride.key, lines: localOverride.lines } : song),
    [song, localOverride],
  )
  const originalKey = song.originalKey || song.key || 'C'
  const isTransposed = Boolean(localOverride)
  songRef.current = effectiveSong
  onChangeRef.current = onChange
  charWidthRef.current = charWidth
  const scaleStyleVars = useMemo(() => {
    const px = (value) => `${Number((value * appliedTextScale).toFixed(3))}px`
    return {
      '--song-scale': appliedTextScale,
      '--song-title-size': px(22),
      '--lyrics-font-size': px(15),
      '--lyrics-line-height': px(24),
      '--chord-chip-size': px(13),
      '--chord-chip-line-height': px(18),
      '--section-label-size': px(12.5),
      '--section-input-size': px(13),
      '--section-key-size': px(11.5),
      '--chords-line-size': px(16),
      '--instrumental-hint-size': px(13),
      '--comment-font-size': px(13.5),
    }
  }, [appliedTextScale])

  useLayoutEffect(() => {
    if (measureRef.current) {
      const w = measureRef.current.getBoundingClientRect().width / 40
      if (w > 0) setCharWidth(w)
    }
  }, [appliedTextScale])

  useEffect(() => {
    if (!song?.id) return
    setLocalOverride(loadLocalSongOverride(song.id))
  }, [song?.id])

  // Opening another song puts us back on the harmony, and the tab marker is
  // read once here — while the notes tab is closed nothing else knows whether
  // this song has a note at all.
  useEffect(() => {
    if (!song?.id) return
    let cancelled = false
    setTab('harmony')
    setHasNote(false)
    readNote(song.id).then((note) => {
      if (!cancelled) setHasNote(Boolean(note) && !isEmptyNotesHtml(note.html))
    })
    return () => {
      cancelled = true
    }
  }, [song?.id])

  // Stable on purpose: SongNotes writes the editor's contents with innerHTML
  // when this identity changes, which would cost the caret mid-sentence.
  const handleNoteEmptyChange = useCallback((isEmpty) => {
    setHasNote(!isEmpty)
  }, [])

  // Keep the screen awake while a song is open (Screen Wake Lock API).
  // The lock is released by the browser when the tab is hidden, so we
  // re-acquire it on visibilitychange.
  useEffect(() => {
    let sentinel = null
    let released = false
    async function acquire() {
      try {
        if (!('wakeLock' in navigator)) return
        sentinel = await navigator.wakeLock.request('screen')
        sentinel.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        // User agent denied or unsupported — fail silently.
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !released) acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (sentinel) sentinel.release()
    }
  }, [song?.id])

  // Persistent window-level listeners driving the chord drag gesture.
  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      if (e.cancelable) e.preventDefault()
      const copy = e.shiftKey
      dragRef.current.copy = copy
      setDrag({ chord: dragRef.current.chord, x: e.clientX, y: e.clientY, copy })
    }
    function onUp(e) {
      if (!dragRef.current) return
      resolveDrop(e.clientX, e.clientY)
      dragRef.current = null
      setDrag(null)
      suppressNextClick()
    }
    function onCancel() {
      if (!dragRef.current) return
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  // Persistent window-level listeners driving the whole-line drag gesture
  // (reorder instrumental lines, or copy with Shift).
  useEffect(() => {
    function onMove(e) {
      if (!lineDragRef.current) return
      if (e.cancelable) e.preventDefault()
      const copy = e.shiftKey
      lineDragRef.current.copy = copy
      setLineDrag({ line: lineDragRef.current.line, x: e.clientX, y: e.clientY, copy })
    }
    function onUp(e) {
      if (!lineDragRef.current) return
      resolveLineDrop(e.clientY)
      lineDragRef.current = null
      setLineDrag(null)
    }
    function onCancel() {
      if (!lineDragRef.current) return
      lineDragRef.current = null
      setLineDrag(null)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  useEffect(() => {
    function onClickCapture(e) {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      if (suppressClickTimer.current) {
        clearTimeout(suppressClickTimer.current)
        suppressClickTimer.current = null
      }
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (suppressClickTimer.current) {
        clearTimeout(suppressClickTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!confirmOriginalKey) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmOriginalKey(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmOriginalKey])

  useEffect(() => {
    return () => {
      if (pendingLineDeleteRef.current) {
        clearTimeout(pendingLineDeleteRef.current.timer)
        pendingLineDeleteRef.current = null
      }
      if (lostEditTimer.current) {
        clearTimeout(lostEditTimer.current)
        lostEditTimer.current = null
      }
    }
  }, [])

  function suppressNextClick() {
    suppressClickRef.current = true
    if (suppressClickTimer.current) {
      clearTimeout(suppressClickTimer.current)
    }
    suppressClickTimer.current = setTimeout(() => {
      suppressClickRef.current = false
      suppressClickTimer.current = null
    }, 250)
  }

  // Turn a pointer's vertical position into an index into `song.lines`.
  //
  // Going through the row's own id rather than its position among the rows is
  // what makes this survive lines that are on screen but not in the DOM —
  // instrumental lines in the lyrics view, comments while the switch is off.
  // Counting rows would place the drop N positions early, N being however
  // many hidden lines sit above it.
  function modelIndexFromPointer(clientY) {
    const song = songRef.current
    if (!canvasRef.current || !song) return 0
    const rows = Array.from(canvasRef.current.querySelectorAll('.line-row'))
    const indexOfRow = (row) => {
      const id = row.getAttribute('data-line-id')
      const index = song.lines.findIndex((l) => l.id === id)
      return index === -1 ? null : index
    }
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const index = indexOfRow(row)
      if (index == null) continue
      if (clientY < rect.top) return index
      if (clientY < rect.bottom) return clientY < rect.top + rect.height / 2 ? index : index + 1
    }
    return song.lines.length
  }

  function resolveDrop(clientX, clientY) {
    const info = dragRef.current
    if (!info) return
    const { fromLineId, chord, grabOffsetX = 0, copy = false } = info
    const song = songRef.current
    const charWidth = charWidthRef.current
    const target = document.elementFromPoint(clientX, clientY)
    const lineRow = target && target.closest ? target.closest('.line-row') : null
    const targetLineType = lineRow && lineRow.getAttribute('data-line-type')
    // Rows that hold no chords. A comment is the important one: it would have
    // accepted the chord into `line.chords`, where nothing renders it and the
    // serialiser drops it — the chord would vanish on the next read.
    // (A page break had the same hole and is closed here too.)
    const isChordlessRow =
      targetLineType === 'section' || targetLineType === 'comment' || targetLineType === 'pagebreak'

    if (lineRow && !isChordlessRow) {
      const targetLineId = lineRow.getAttribute('data-line-id')
      const lineModeAttr = lineRow.getAttribute('data-line-mode')
      const targetLine = song.lines.find((l) => l.id === targetLineId)
      let position = 0
      if (targetLine) {
        const others = targetLine.chords.filter((c) => c.id !== chord.id)
        if (lineModeAttr === 'both' && targetLineType !== 'chords') {
          const stripEl = lineRow.querySelector('.chords-strip')
          const areaRect = stripEl?.getBoundingClientRect() ?? lineRow.getBoundingClientRect()
          const offsetX = clientX - areaRect.left - grabOffsetX
          const snapped = Math.round(offsetX / charWidth)
          const lyricsLength = typeof targetLine.lyrics === 'string' ? targetLine.lyrics.length : 0
          const existingExtent = others.length ? Math.max(...others.map((c) => c.position)) : 0
          const widthColumns = areaRect ? Math.round(areaRect.width / charWidth) : 0
          const maxColumns = Math.max(lyricsLength, widthColumns, existingExtent)
          position = Math.max(0, Math.min(maxColumns, snapped))
        } else {
          position = others.length ? Math.max(...others.map((c) => c.position)) + 1 : 0
        }
      }
      const placedChord = copy ? { ...chord, id: uid(), position } : { ...chord, position }
      const lines = song.lines.map((l) => {
        if (l.id === targetLineId) {
          if (copy) {
            return { ...l, chords: [...l.chords, placedChord] }
          }
          const withoutOld = l.chords.filter((c) => c.id !== chord.id)
          return { ...l, chords: [...withoutOld, placedChord] }
        }
        if (!copy && l.id === fromLineId) {
          return { ...l, chords: l.chords.filter((c) => c.id !== chord.id) }
        }
        return l
      })
      commitPatchRef.current({ lines })
    } else if (canvasRef.current) {
      // Dropped on empty canvas space -> create a new line at that vertical position.
      const insertIndex = modelIndexFromPointer(clientY)
      const baseLines = copy
        ? song.lines
        : song.lines.map((l) =>
            l.id === fromLineId ? { ...l, chords: l.chords.filter((c) => c.id !== chord.id) } : l,
          )
      const newChord = copy ? { ...chord, id: uid(), position: 0 } : { ...chord, position: 0 }
      const newLine = { id: uid(), type: 'line', lyrics: '', chords: [newChord] }
      const lines = [...baseLines.slice(0, insertIndex), newLine, ...baseLines.slice(insertIndex)]
      commitPatchRef.current({ lines })
    }
  }

  function handleChordDragStart({ line, chord, clientX, clientY, grabOffsetX = 0, shiftKey = false }) {
    dragRef.current = { fromLineId: line.id, chord, grabOffsetX, copy: shiftKey }
    setDrag({ chord, x: clientX, y: clientY, copy: shiftKey })
  }

  // Build a deep copy of a line with fresh ids for the line and every chord so
  // duplicated content never collides with the original.
  function cloneLineWithNewIds(line) {
    const chords = (line.chords || []).map((c) => ({ ...c, id: uid() }))
    return { ...line, id: uid(), chords }
  }

  function resolveLineDrop(clientY) {
    const info = lineDragRef.current
    if (!info) return
    const { line, copy = false } = info
    const song = songRef.current
    if (!canvasRef.current) return
    const insertIndex = modelIndexFromPointer(clientY)
    let lines
    if (copy) {
      const clone = cloneLineWithNewIds(line)
      lines = [...song.lines.slice(0, insertIndex), clone, ...song.lines.slice(insertIndex)]
    } else {
      const without = song.lines.filter((l) => l.id !== line.id)
      const fromIndex = song.lines.findIndex((l) => l.id === line.id)
      let target = insertIndex
      if (fromIndex !== -1 && fromIndex < target) target -= 1
      target = Math.max(0, Math.min(target, without.length))
      lines = [...without.slice(0, target), line, ...without.slice(target)]
    }
    commitPatchRef.current({ lines })
  }

  function handleLineDragStart({ line, clientX, clientY, shiftKey = false }) {
    lineDragRef.current = { line, copy: shiftKey }
    setLineDrag({ line, x: clientX, y: clientY, copy: shiftKey })
  }

  // Single entry for content patches. While a local transposition override
  // is active, key/lines edits are routed to the localStorage override
  // (never to the server); everything else is forwarded to the server.
  function commitPatch(patch) {
    if (!localOverride) {
      onChange(patch)
      return
    }
    const serverPatch = { ...patch }
    const localFields = {}
    if (Object.prototype.hasOwnProperty.call(patch, 'lines')) {
      localFields.lines = patch.lines
      delete serverPatch.lines
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'key')) {
      localFields.key = patch.key
      delete serverPatch.key
    }
    if (Object.keys(localFields).length) {
      setLocalOverride((prev) => {
        const next = { ...prev, ...localFields }
        if (song?.id) saveLocalSongOverride(song.id, next)
        return next
      })
    }
    if (Object.keys(serverPatch).length) {
      onChange(serverPatch)
    }
  }
  commitPatchRef.current = commitPatch

  // Every popover and every row handler finds its target by id, and that
  // lookup is meant to succeed: lineIdentity.js keeps ids stable across a
  // refetch precisely so an id captured when a menu opened still resolves when
  // it is used. Should one ever miss anyway, the edit has nowhere to land —
  // and the one outcome to rule out is losing it without a word, which is how
  // this whole class of bug reached the user in the first place.
  function reportLostEdit(what) {
    console.warn(`Не найдена строка или аккорд для «${what}» — правка не применена`)
    setLostEdit(what)
    if (lostEditTimer.current) clearTimeout(lostEditTimer.current)
    lostEditTimer.current = setTimeout(() => {
      lostEditTimer.current = null
      setLostEdit(null)
    }, 6000)
  }

  /** Look a line up for `what`, announcing it rather than failing quietly. */
  function requireLine(lineId, what) {
    const line = effectiveSong.lines.find((l) => l.id === lineId)
    if (!line) reportLostEdit(what)
    return line
  }

  function updateLine(lineId, patch) {
    let found = false
    const lines = effectiveSong.lines.map((l) => {
      if (l.id !== lineId) return l
      found = true
      return { ...l, ...patch }
    })
    // Without this the map quietly returns the list unchanged and commits it:
    // a PATCH that says nothing, and an edit the user watched disappear.
    if (!found) return reportLostEdit('изменение строки')
    commitPatch({ lines })
  }

  function deleteLine(lineId) {
    const idx = effectiveSong.lines.findIndex((l) => l.id === lineId)
    if (idx === -1) return reportLostEdit('удаление строки')
    const line = effectiveSong.lines[idx]
    if (pendingLineDeleteRef.current) {
      clearTimeout(pendingLineDeleteRef.current.timer)
    }
    const remaining = effectiveSong.lines.filter((l) => l.id !== lineId)
    const wasLast = remaining.length === 0
    const lines = remaining.length ? remaining : [emptyLine()]
    commitPatch({ lines })
    if (focusedLineId === lineId) setFocusedLineId(null)
    const expiresAt = Date.now() + UNDO_TIMEOUT_MS
    const timer = setTimeout(() => {
      pendingLineDeleteRef.current = null
      setPendingLineDelete(null)
    }, UNDO_TIMEOUT_MS)
    pendingLineDeleteRef.current = { line, index: idx, expiresAt, timer, wasLast }
    setPendingLineDelete({ line, index: idx, expiresAt, wasLast })
  }

  function undoLineDelete() {
    const pending = pendingLineDeleteRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingLineDeleteRef.current = null
    setPendingLineDelete(null)
    const current = songRef.current.lines
    if (current.some((l) => l.id === pending.line.id)) return
    let lines = [...current]
    if (pending.wasLast && lines.length === 1 && isPristineEmptyLine(lines[0])) {
      lines = []
    }
    const insertIndex = Math.min(pending.index, lines.length)
    lines.splice(insertIndex, 0, pending.line)
    commitPatchRef.current({ lines })
  }

  function addLineAt(index, newLine) {
    const lines = [...effectiveSong.lines]
    lines.splice(index, 0, newLine)
    commitPatch({ lines })
  }

  // When a line is focused (last clicked/edited), new lines from the FAB /
  // empty-area gesture are inserted right after it instead of at the very end.
  function focusAwareInsertIndex() {
    if (focusedLineId) {
      const idx = effectiveSong.lines.findIndex((l) => l.id === focusedLineId)
      if (idx !== -1) return idx + 1
    }
    return effectiveSong.lines.length
  }

  function openAddMenu(x, y, insertAt) {
    setAddMenu({ anchor: { x, y }, insertAt })
  }

  function lineSummary(line) {
    if (!line) return ''
    if (line.type === 'section') return line.label || 'Раздел'
    if (line.type === 'comment') return line.lyrics || 'Комментарий'
    if (line.type === 'chords') {
      const seq = [...line.chords].sort((a, b) => a.position - b.position).map((c) => c.chord)
      return seq.length ? seq.join(' ') : 'Проигрыш'
    }
    return line.lyrics || '(пустая строка)'
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }

  function describeInsertPosition(insertAt) {
    if (!effectiveSong.lines.length) return 'Новая строка'
    if (insertAt <= 0) return 'Добавить в начало'
    if (insertAt >= effectiveSong.lines.length) return 'Добавить в конец'
    return `Добавить после «${truncate(lineSummary(effectiveSong.lines[insertAt - 1]), 22)}»`
  }

  function toggleComments(next) {
    const value = Boolean(next)
    setShowComments(value)
    saveShowComments(value)
  }

  function commitAddMenu(type) {
    if (!addMenu) return
    const newLine =
      type === 'section'
        ? sectionLine('')
        : type === 'chords'
          ? instrumentalLine()
          : type === 'pagebreak'
            ? pagebreakLine()
            : type === 'comment'
              ? commentLine()
              : emptyLine()
    // Adding a comment while comments are hidden would look like nothing
    // happened. Asking to write one is asking to see them.
    if (type === 'comment' && !showComments) toggleComments(true)
    addLineAt(addMenu.insertAt, newLine)
    setFocusedLineId(newLine.id)
    setAddMenu(null)
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'touch') return
    longPressFired.current = false
    const { clientX, clientY } = e
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      openAddMenu(clientX, clientY, focusAwareInsertIndex())
    }, LONG_PRESS_MS)
  }
  function handlePointerUp(e) {
    clearTimeout(pressTimer.current)
    if (e.pointerType !== 'touch') return
    const now = Date.now()
    if (now - lastEmptyTapAtRef.current < DBL_TAP_MS) {
      lastEmptyTapAtRef.current = 0
      // Suppress the synthesized dblclick that some browsers fire after a
      // touch double-tap, so the menu doesn't open twice.
      longPressFired.current = true
      openAddMenu(e.clientX, e.clientY, focusAwareInsertIndex())
    } else {
      lastEmptyTapAtRef.current = now
    }
  }
  function cancelPress() {
    clearTimeout(pressTimer.current)
  }
  function handleDoubleClick(e) {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    openAddMenu(e.clientX, e.clientY, focusAwareInsertIndex())
  }

  function applyTransposeTo(base, delta) {
    const newKey = transposeKey(base.key, delta)
    const preferFlat = parseKey(newKey).preferFlat
    const lines = base.lines.map((l) => {
      // A stored fingering is tied to specific frets; it doesn't survive a
      // key change (an open-position shape has no transposed equivalent).
      const chords = l.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, delta, preferFlat), voicing: null }))
      if (l.type === 'section' && l.key) {
        return { ...l, chords, key: transposeKey(l.key, delta) }
      }
      return { ...l, chords }
    })
    return { key: newKey, lines }
  }

  function handleTranspose(delta) {
    const base = localOverride || { key: effectiveSong.key, lines: effectiveSong.lines }
    const next = applyTransposeTo(base, delta)
    setLocalOverride(next)
    if (song?.id) saveLocalSongOverride(song.id, next)
  }

  function handleRequestOriginalKeyReset() {
    if (!isTransposed) return
    setConfirmOriginalKey(true)
  }

  function handleConfirmOriginalKeyReset() {
    if (!localOverride) {
      setConfirmOriginalKey(false)
      return
    }
    // Commit the local transposed copy to the server as the new original.
    onChange({
      key: localOverride.key,
      originalKey: localOverride.key,
      lines: localOverride.lines,
    })
    setLocalOverride(null)
    if (song?.id) clearLocalSongOverride(song.id)
    setConfirmOriginalKey(false)
  }

  function handleDismissOriginalKeyDialog() {
    setConfirmOriginalKey(false)
  }

  function handleResetKeyToOriginal() {
    if (!localOverride) return
    // Reset the key back to the server's original without discarding any line
    // edits made while transposed — keep them in the local override (in the
    // original key) so the user can still commit them via "set as original".
    const delta = keySemitoneDelta(localOverride.key, originalKey)
    if (delta == null || delta === 0) return
    const next = applyTransposeTo(localOverride, delta)
    if (next.key === originalKey) {
      setLocalOverride(next)
      if (song?.id) saveLocalSongOverride(song.id, next)
    }
  }

  function openPicker(info) {
    setPicker(info)
  }
  function closePicker() {
    setPicker(null)
  }

  // frets: only set when the chord came from the neck tab (tapped, not
  // typed) — encoded and used as-is; otherwise any prior fingering is kept
  // only if the symbol didn't actually change.
  function commitPicker(chord, frets = null) {
    if (!picker) return
    const line = requireLine(picker.lineId, 'аккорд')
    if (!line) return closePicker()
    const voicing = frets ? encodeVoicing(frets) : null
    let chords
    if (picker.mode === 'add') {
      chords = [...line.chords, { id: uid(), position: picker.position, chord, voicing }]
    } else {
      if (!line.chords.some((c) => c.id === picker.chordId)) {
        closePicker()
        return reportLostEdit('аккорд')
      }
      chords = line.chords.map((c) =>
        c.id === picker.chordId
          ? { ...c, chord, voicing: frets ? voicing : c.chord === chord ? c.voicing : null }
          : c
      )
    }
    updateLine(picker.lineId, { chords })
    closePicker()
  }

  function deletePicker() {
    if (!picker) return
    const line = requireLine(picker.lineId, 'удаление аккорда')
    if (!line) return closePicker()
    const chords = line.chords.filter((c) => c.id !== picker.chordId)
    if (chords.length === line.chords.length) {
      closePicker()
      return reportLostEdit('удаление аккорда')
    }
    updateLine(picker.lineId, { chords })
    closePicker()
  }

  // Long-press / right-click on a line: reuse the add-line menu, targeted to
  // insert right after that specific line.
  function handleRequestLineMenu(lineId, x, y) {
    const idx = effectiveSong.lines.findIndex((l) => l.id === lineId)
    setFocusedLineId(lineId)
    openAddMenu(x, y, idx === -1 ? effectiveSong.lines.length : idx + 1)
  }

  // Long-press / right-click on the meta bar: insert a new line at the very
  // top (before the first line).
  function handleRequestInsertTop(x, y) {
    openAddMenu(x, y, 0)
  }

  // Long-press / right-click on a chord chip: mini Edit/Delete menu.
  function handleChordMenuRequest(info) {
    setChordMenu(info)
  }
  function closeChordMenu() {
    setChordMenu(null)
  }
  function handleChordMenuEdit() {
    if (!chordMenu) return
    const line = effectiveSong.lines.find((l) => l.id === chordMenu.lineId)
    const chord = line?.chords.find((c) => c.id === chordMenu.chordId)
    openPicker({
      lineId: chordMenu.lineId,
      mode: 'edit',
      chordId: chordMenu.chordId,
      initialValue: chordMenu.chordText,
      initialVoicing: decodeVoicing(chord?.voicing),
      anchor: chordMenu.anchor,
    })
    closeChordMenu()
  }
  function handleChordMenuDelete() {
    if (!chordMenu) return
    // Must read from effectiveSong (song + any local transpose override) —
    // chordMenu.chordId comes from what's actually rendered, and while
    // transposed that has different chord ids than the raw `song` object,
    // so looking it up there silently found nothing to delete.
    const line = requireLine(chordMenu.lineId, 'удаление аккорда')
    closeChordMenu()
    if (!line) return
    const chords = line.chords.filter((c) => c.id !== chordMenu.chordId)
    if (chords.length === line.chords.length) return reportLostEdit('удаление аккорда')
    updateLine(line.id, { chords })
  }
  function handleChordMenuFingering() {
    if (!chordMenu) return
    const line = effectiveSong.lines.find((l) => l.id === chordMenu.lineId)
    const chord = line?.chords.find((c) => c.id === chordMenu.chordId)
    setFingeringTarget({
      lineId: chordMenu.lineId,
      chordId: chordMenu.chordId,
      chordText: chordMenu.chordText,
      voicing: chord?.voicing || null,
    })
    closeChordMenu()
  }
  /**
   * The target line's chords with the fingering modal's chord set to `code`.
   * `null` when the modal's target no longer resolves — reported, not ignored:
   * this is the one handler that leaves its dialog open, so a tap that does
   * nothing looks exactly like a tap that did not register.
   */
  function voicedChords(code) {
    const line = requireLine(fingeringTarget.lineId, 'аппликатура')
    if (!line) return null
    if (!line.chords.some((c) => c.id === fingeringTarget.chordId)) {
      reportLostEdit('аппликатура')
      return null
    }
    return line.chords.map((c) => (c.id === fingeringTarget.chordId ? { ...c, voicing: code } : c))
  }

  // Picked one of the fingering cards from the library for this exact
  // chord — keep the name, just remember which shape to use here. Stays open
  // (with the picked card now highlighted) so the choice is visible without
  // reopening the modal. `code` is already the library's encoded string.
  function handleSelectVoicing(code) {
    if (!fingeringTarget) return
    const chords = voicedChords(code)
    if (!chords) return
    updateLine(fingeringTarget.lineId, { chords })
    setFingeringTarget((cur) => (cur ? { ...cur, voicing: code } : cur))
  }
  // Clicking the already-selected card again: clear it, back to "no specific
  // shape pinned for this spot".
  function handleDeselectVoicing() {
    if (!fingeringTarget) return
    const chords = voicedChords(null)
    if (!chords) return
    updateLine(fingeringTarget.lineId, { chords })
    setFingeringTarget((cur) => (cur ? { ...cur, voicing: null } : cur))
  }
  function closeFingeringModal() {
    setFingeringTarget(null)
  }

  function handlePickFile() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const parsed = await importPdf(file)
      if (parsed?.lines?.length) {
        const patch = { lines: [...effectiveSong.lines, ...parsed.lines] }
        if (parsed.title) patch.title = parsed.title
        if (parsed.bpm) patch.bpm = parsed.bpm
        if (parsed.timeSignature) patch.timeSignature = parsed.timeSignature
        if (parsed.primaryKey) patch.key = parsed.primaryKey
        commitPatch(patch)
      } else {
        alert('Не удалось разобрать PDF. Сервер вернул пустой результат.')
      }
    } catch (err) {
      console.error(err)
      const message = err instanceof ApiError ? err.message : 'Не удалось прочитать PDF. Попробуйте другой файл.'
      alert(message)
    } finally {
      setImporting(false)
    }
  }

  // Everything downstream — the three view modes, the PDF, the drag targets —
  // works off this list, so hiding comments is one filter in one place rather
  // than a condition repeated in every renderer.
  const visibleLines = showComments
    ? effectiveSong.lines
    : effectiveSong.lines.filter((l) => l.type !== 'comment')
  const hasComments = effectiveSong.lines.some((l) => l.type === 'comment')

  const groups =
    viewMode === 'chords'
      ? collapseRepeats(
          visibleLines.filter(
            (l) => l.type === 'section' || l.type === 'pagebreak' || l.type === 'comment' || l.chords.length > 0,
          ),
        )
      : null
  // Chords view layout: consecutive chord-carrying lines flow horizontally
  // inside one container, so a song whose chords change rarely reads as a few
  // wide rows instead of a tall column of nearly empty ones. Sections and page
  // breaks stay full width and break the flow, which is what keeps the layout
  // roughly aligned with the song's structure.
  function renderChordsFlow() {
    const nodes = []
    let run = []
    let runKey = null
    function flush() {
      if (run.length) nodes.push(<div className="chords-flow" key={`flow-${runKey}`}>{run}</div>)
      run = []
      runKey = null
    }
    for (const g of groups) {
      const line = effectiveSong.lines.find((l) => l.id === g.key)
      if (!line) continue
      // A comment carries no chords, so it cannot be a cell in the flow; like
      // a section it takes the full width and breaks the run.
      if (line.type === 'section' || line.type === 'pagebreak' || line.type === 'comment') {
        flush()
        nodes.push(<Line key={g.key} line={line} mode="chordsOnly" />)
        continue
      }
      const repeatCount = g.count > 1 ? g.count : line.repeatCount || 1
      if (!run.length) runKey = g.key
      run.push(<Line key={g.key} line={line} mode="chordsOnly" repeatCount={repeatCount} />)
    }
    flush()
    return nodes
  }

  const lineMode = viewMode === 'chords' ? 'chordsOnly' : viewMode === 'lyrics' ? 'lyrics' : 'both'
  const readOnlyChords = viewMode === 'chords'
  const hasAnyChords = groups ? groups.some((g) => g.sequence.length > 0) : true

  // Different sections can carry their own key override; propagate it
  // forward so chord suggestions stay relevant to whichever section a line
  // actually belongs to.
  const effectiveKeys = {}
  {
    let current = effectiveSong.key
    for (const l of effectiveSong.lines) {
      if (l.type === 'section' && l.key) current = l.key
      effectiveKeys[l.id] = current
    }
  }

  // While locked, tapping a chord opens its fingering instead of editing it.
  // Looking up how to play something is the main reason to have the song open
  // at all, so the lock must not stand in front of it.
  function handleViewFingering(line, chord) {
    setFingeringTarget({
      lineId: line.id,
      chordId: chord.id,
      chordText: chord.chord,
      voicing: chord.voicing || null,
    })
  }

  const lineElements = visibleLines.map((line) => (
    <Line
      key={line.id}
      line={line}
      mode={lineMode}
      charWidth={charWidth}
      draggingChordId={drag?.chord.id}
      isFocused={line.id === focusedLineId}
      onFocusLine={setFocusedLineId}
      onUpdateLine={(patch) => updateLine(line.id, patch)}
      onOpenPicker={openPicker}
      onDeleteLine={() => deleteLine(line.id)}
      onChordDragStart={handleChordDragStart}
      // Same guard as onRequestInsertTop below: a long press or a double
      // tap on a row opened the "add line" menu regardless of the lock.
      onRequestLineMenu={locked ? undefined : handleRequestLineMenu}
      onChordMenu={handleChordMenuRequest}
      onLineDragStart={handleLineDragStart}
      draggingLineId={lineDrag?.line.id}
      locked={locked}
      onViewFingering={handleViewFingering}
    />
  ))
  if (addMenu) {
    // `insertAt` indexes the song; the indicator sits among the rows actually
    // rendered, which is fewer of them while comments are hidden.
    const visibleBefore = effectiveSong.lines
      .slice(0, addMenu.insertAt)
      .filter((l) => showComments || l.type !== 'comment').length
    const idx = Math.max(0, Math.min(visibleBefore, lineElements.length))
    lineElements.splice(idx, 0, <div key="insert-indicator" className="insert-indicator" />)
  }

  return (
    <div className="app has-song-tabs" style={scaleStyleVars}>
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <IconChevronLeft />
          Песни
        </button>
        <div className="topbar-title topbar-title-song">{song.title || 'Без названия'}</div>
        {!readOnlyChords && (
          <Tooltip label="Импорт из PDF">
            <button className="icon-btn" onClick={handlePickFile} aria-label="Импорт из PDF" disabled={importing}>
              <IconUpload />
            </button>
          </Tooltip>
        )}
        <LockButton />
        <Tooltip label="Настройки приложения">
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Настройки приложения">
            <IconSettings />
          </button>
        </Tooltip>
        <Tooltip label="Предпросмотр PDF">
          <button
            className="icon-btn"
            onClick={() => setPrintPreview(true)}
            aria-label="Предпросмотр PDF"
          >
            <IconPrinter />
          </button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <ThemeMenu theme={theme} onChange={onThemeChange} />
      </div>
      <LockNotice />

      {tab === 'harmony' && (
        <MetaBar
          song={effectiveSong}
          onChange={commitPatch}
          onTranspose={handleTranspose}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          isTransposed={isTransposed}
          // Both of these write to the server. They hang off container-level
          // gestures (long press on the key field, double tap on the meta bar),
          // which CSS cannot single out without also disabling what sits inside.
          onRequestOriginalKeyReset={locked ? undefined : handleRequestOriginalKeyReset}
          onResetOriginalKey={handleResetKeyToOriginal}
          onRequestInsertTop={readOnlyChords || locked ? undefined : handleRequestInsertTop}
          showComments={showComments}
          hasComments={hasComments}
          onToggleComments={toggleComments}
        />
      )}

      <span
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'pre',
          fontFamily: 'var(--font-mono)',
          fontSize: 15 * appliedTextScale,
        }}
      >
        {'M'.repeat(40)}
      </span>

      {tab === 'harmony' ? (
        <div
          className="canvas"
          ref={canvasRef}
          id="song-panel-harmony"
          role="tabpanel"
          aria-labelledby="song-tab-harmony"
        >
          {viewMode === 'chords' && !hasAnyChords && (
            <div className="canvas-hint">В этой песне пока нет аккордов</div>
          )}

          {viewMode === 'chords' ? renderChordsFlow() : lineElements}

          {!readOnlyChords && (
            <div
              className="canvas-empty-area"
              onDoubleClick={handleDoubleClick}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
            >
              <div className="canvas-hint">
                {importing
                  ? 'Импорт PDF…'
                  : isCoarsePointer
                    ? 'Долгое нажатие по аккорду — изменить · долгое нажатие по строке — добавить аккорд'
                    : 'Клик по строке — добавить аккорд · двойной клик по аккорду — изменить'}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="song-panel"
          id="song-panel-notes"
          role="tabpanel"
          aria-labelledby="song-tab-notes"
        >
          <SongNotes songId={song.id} onEmptyChange={handleNoteEmptyChange} />
        </div>
      )}

      {tab === 'harmony' && !readOnlyChords && (
        <Tooltip label="Добавить строку">
          <button
            className="fab"
            onClick={(e) => openAddMenu(e.clientX, e.clientY, focusAwareInsertIndex())}
            aria-label="Добавить строку"
          >
            <IconPlus />
          </button>
        </Tooltip>
      )}

      {picker && (
        <ChordPicker
          songKey={effectiveKeys[picker.lineId] || song.key}
          initialValue={picker.initialValue || ''}
          initialVoicing={picker.initialVoicing || null}
          canDelete={picker.mode === 'edit'}
          anchor={picker.anchor}
          onCommit={commitPicker}
          onDelete={deletePicker}
          onClose={closePicker}
        />
      )}

      {drag && (
        <div
          className={'chord-drag-ghost' + (drag.copy ? ' is-copy' : '')}
          style={{ left: drag.x, top: drag.y }}
        >
          {drag.copy && (
            <span className="chord-drag-copy-badge" aria-hidden>
              <IconPlus />
            </span>
          )}
          {drag.chord.chord}
        </div>
      )}

      {lineDrag && (
        <div
          className={'line-drag-ghost' + (lineDrag.copy ? ' is-copy' : '')}
          style={{ left: lineDrag.x, top: lineDrag.y }}
        >
          {lineDrag.copy && (
            <span className="chord-drag-copy-badge" aria-hidden>
              <IconPlus />
            </span>
          )}
          <IconMusic className="line-drag-ghost-icon" />
          <span className="line-drag-ghost-text">
            {[...lineDrag.line.chords].sort((a, b) => a.position - b.position).map((c) => c.chord).join(' | ') || 'Проигрыш'}
          </span>
        </div>
      )}

      {addMenu && (
        <AddLineMenu
          anchor={addMenu.anchor}
          contextLabel={describeInsertPosition(addMenu.insertAt)}
          onChoose={commitAddMenu}
          onClose={() => setAddMenu(null)}
        />
      )}

      {chordMenu && (
        <ChordContextMenu
          chordText={chordMenu.chordText}
          anchor={chordMenu.anchor}
          onEdit={handleChordMenuEdit}
          onDelete={handleChordMenuDelete}
          onFingering={handleChordMenuFingering}
          onClose={closeChordMenu}
        />
      )}

      {fingeringTarget && (
        <ChordFingeringModal
          chordText={fingeringTarget.chordText}
          selectedVoicing={fingeringTarget.voicing}
          readOnly={locked}
          onClose={closeFingeringModal}
          onSelectVoicing={handleSelectVoicing}
          onDeselectVoicing={handleDeselectVoicing}
          onOpenLibrary={onOpenLibrary}
        />
      )}

      {confirmOriginalKey && (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="original-key-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismissOriginalKeyDialog()
          }}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-title" id="original-key-modal-title">
              Сделать текущую тональность оригинальной?
            </div>
            <div className="confirm-modal-text">
              «{effectiveSong.key || '—'}» заменит «{originalKey}» как оригинальная тональность песни.
            </div>
            <div className="confirm-modal-actions">
              <button type="button" className="ghost-btn" onClick={handleDismissOriginalKeyDialog}>
                Отмена
              </button>
              <button type="button" className="accent-btn" onClick={handleConfirmOriginalKeyReset}>
                Сделать оригинальной
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLineDelete && (
        <UndoBanner
          message="Строка удалена"
          expiresAt={pendingLineDelete.expiresAt}
          onUndo={undoLineDelete}
        />
      )}

      {/* Should never appear. If it does, something the user did was dropped,
          and they get to know that instead of wondering why the song did not
          change — see reportLostEdit. */}
      {lostEdit && (
        <div className="save-banner" role="alert">
          <span>Правка не применилась — песня изменилась. Попробуйте ещё раз.</span>
          <button type="button" onClick={() => setLostEdit(null)}>
            Понятно
          </button>
        </div>
      )}

      <SongTabs value={tab} onChange={setTab} hasNotes={hasNote} />

      {printPreview && (
        <PrintPreview
          song={effectiveSong}
          viewMode={viewMode}
          showComments={showComments}
          appliedTextScale={appliedTextScale}
          onChange={commitPatch}
          onClose={() => setPrintPreview(false)}
          onDownload={() => window.print()}
        />
      )}
    </div>
  )
}
