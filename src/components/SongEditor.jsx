import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import MetaBar from './MetaBar.jsx'
import Line from './Line.jsx'
import ChordPicker from './ChordPicker.jsx'
import AddLineMenu from './AddLineMenu.jsx'
import ChordContextMenu from './ChordContextMenu.jsx'
import { IconChevronLeft, IconPlus, IconSettings, IconUpload, IconEye } from './Icons.jsx'
import ThemeMenu from './ThemeMenu.jsx'
import Tooltip from './Tooltip.jsx'
import { transposeChord, transposeKey, parseKey, keySemitoneDelta } from '../lib/music.js'
import { emptyLine, sectionLine, instrumentalLine, pagebreakLine, uid } from '../lib/storage.js'
import { collapseRepeats } from '../lib/repeats.js'
import EditorSettingsModal from './EditorSettingsModal.jsx'
import PrintPreview from './PrintPreview.jsx'
import { ApiError, importPdf } from '../lib/api.js'
import { UNDO_TIMEOUT_MS } from '../lib/undo.js'
import UndoBanner from './UndoBanner.jsx'

const LONG_PRESS_MS = 500
const TEXT_SCALE_MIN = 0.85
const TEXT_SCALE_MAX = 1.4
const TEXT_SCALE_STEP = 0.05

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
  onTextScaleChange,
}) {
  const [picker, setPicker] = useState(null)
  const [addMenu, setAddMenu] = useState(null)
  const [chordMenu, setChordMenu] = useState(null)
  const [charWidth, setCharWidth] = useState(8.6)
  const [drag, setDrag] = useState(null)
  const [importing, setImporting] = useState(false)
  const [focusedLineId, setFocusedLineId] = useState(null)
  const [confirmOriginalKey, setConfirmOriginalKey] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [pendingLineDelete, setPendingLineDelete] = useState(null)
  const measureRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const pressTimer = useRef(null)
  const longPressFired = useRef(false)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimer = useRef(null)
  const songRef = useRef(song)
  const onChangeRef = useRef(onChange)
  const charWidthRef = useRef(charWidth)
  const pendingLineDeleteRef = useRef(null)
  songRef.current = song
  onChangeRef.current = onChange
  charWidthRef.current = charWidth
  const appliedTextScale = Number.isFinite(textScale) ? textScale : 1
  const originalKey = song.originalKey || song.key || 'C'
  const isTransposed = Boolean(song.key && song.key !== originalKey)
  const scaleStyleVars = useMemo(() => {
    const px = (value) => `${Number((value * appliedTextScale).toFixed(3))}px`
    return {
      '--song-scale': appliedTextScale,
      '--song-title-size': px(22),
      '--lyrics-font-size': px(15),
      '--lyrics-line-height': px(22),
      '--chord-chip-size': px(13),
      '--chord-chip-line-height': px(18),
      '--section-label-size': px(12.5),
      '--section-input-size': px(13),
      '--section-key-size': px(11.5),
      '--chords-line-size': px(14),
      '--instrumental-hint-size': px(13),
    }
  }, [appliedTextScale])

  useLayoutEffect(() => {
    if (measureRef.current) {
      const w = measureRef.current.getBoundingClientRect().width / 40
      if (w > 0) setCharWidth(w)
    }
  }, [appliedTextScale])

  // Persistent window-level listeners driving the chord drag gesture.
  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      if (e.cancelable) e.preventDefault()
      setDrag({ chord: dragRef.current.chord, x: e.clientX, y: e.clientY })
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

  function resolveDrop(clientX, clientY) {
    const info = dragRef.current
    if (!info) return
    const { fromLineId, chord, grabOffsetX = 0 } = info
    const song = songRef.current
    const charWidth = charWidthRef.current
    const target = document.elementFromPoint(clientX, clientY)
    const lineRow = target && target.closest ? target.closest('.line-row') : null
    const targetLineType = lineRow && lineRow.getAttribute('data-line-type')
    const isSectionRow = targetLineType === 'section'

    if (lineRow && !isSectionRow) {
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
      const lines = song.lines.map((l) => {
        if (l.id === targetLineId) {
          const withoutOld = l.chords.filter((c) => c.id !== chord.id)
          return { ...l, chords: [...withoutOld, { ...chord, position }] }
        }
        if (l.id === fromLineId) {
          return { ...l, chords: l.chords.filter((c) => c.id !== chord.id) }
        }
        return l
      })
      onChangeRef.current({ lines })
    } else if (canvasRef.current) {
      // Dropped on empty canvas space -> create a new line at that vertical position.
      const rows = Array.from(canvasRef.current.querySelectorAll('.line-row'))
      let insertIndex = rows.length
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect()
        if (clientY < r.top) {
          insertIndex = i
          break
        }
      }
      const withoutOld = song.lines.map((l) =>
        l.id === fromLineId ? { ...l, chords: l.chords.filter((c) => c.id !== chord.id) } : l,
      )
      const newLine = { id: uid(), type: 'line', lyrics: '', chords: [{ ...chord, position: 0 }] }
      const lines = [...withoutOld.slice(0, insertIndex), newLine, ...withoutOld.slice(insertIndex)]
      onChangeRef.current({ lines })
    }
  }

  function handleChordDragStart({ line, chord, clientX, clientY, grabOffsetX = 0 }) {
    dragRef.current = { fromLineId: line.id, chord, grabOffsetX }
    setDrag({ chord, x: clientX, y: clientY })
  }

  function updateLine(lineId, patch) {
    const lines = song.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    onChange({ lines })
  }

  function deleteLine(lineId) {
    const idx = song.lines.findIndex((l) => l.id === lineId)
    if (idx === -1) return
    const line = song.lines[idx]
    if (pendingLineDeleteRef.current) {
      clearTimeout(pendingLineDeleteRef.current.timer)
    }
    const remaining = song.lines.filter((l) => l.id !== lineId)
    const wasLast = remaining.length === 0
    const lines = remaining.length ? remaining : [emptyLine()]
    onChange({ lines })
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
    onChangeRef.current({ lines })
  }

  function addLineAt(index, newLine) {
    const lines = [...song.lines]
    lines.splice(index, 0, newLine)
    onChange({ lines })
  }

  // When a line is focused (last clicked/edited), new lines from the FAB /
  // empty-area gesture are inserted right after it instead of at the very end.
  function focusAwareInsertIndex() {
    if (focusedLineId) {
      const idx = song.lines.findIndex((l) => l.id === focusedLineId)
      if (idx !== -1) return idx + 1
    }
    return song.lines.length
  }

  function openAddMenu(x, y, insertAt) {
    setAddMenu({ anchor: { x, y }, insertAt })
  }

  function lineSummary(line) {
    if (!line) return ''
    if (line.type === 'section') return line.label || 'Раздел'
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
    if (!song.lines.length) return 'Новая строка'
    if (insertAt <= 0) return 'Добавить в начало'
    if (insertAt >= song.lines.length) return 'Добавить в конец'
    return `Добавить после «${truncate(lineSummary(song.lines[insertAt - 1]), 22)}»`
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
            : emptyLine()
    addLineAt(addMenu.insertAt, newLine)
    setFocusedLineId(newLine.id)
    setAddMenu(null)
  }

  function handlePointerDown(e) {
    longPressFired.current = false
    const { clientX, clientY } = e
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      openAddMenu(clientX, clientY, focusAwareInsertIndex())
    }, LONG_PRESS_MS)
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

  function handleTranspose(delta) {
    const newKey = transposeKey(song.key, delta)
    const preferFlat = parseKey(newKey).preferFlat
    const lines = song.lines.map((l) => {
      const chords = l.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, delta, preferFlat) }))
      if (l.type === 'section' && l.key) {
        return { ...l, chords, key: transposeKey(l.key, delta) }
      }
      return { ...l, chords }
    })
    onChange({ key: newKey, lines })
  }

  function handleRequestOriginalKeyReset() {
    if (!isTransposed) return
    setConfirmOriginalKey(true)
  }

  function handleConfirmOriginalKeyReset() {
    onChange({ originalKey: song.key })
    setConfirmOriginalKey(false)
  }

  function handleDismissOriginalKeyDialog() {
    setConfirmOriginalKey(false)
  }

  function handleResetKeyToOriginal() {
    if (!isTransposed) return
    const delta = keySemitoneDelta(song.key, originalKey)
    if (delta == null) {
      onChange({ key: originalKey })
      return
    }
    if (delta === 0) return
    handleTranspose(delta)
  }

  function openPicker(info) {
    setPicker(info)
  }
  function closePicker() {
    setPicker(null)
  }

  function commitPicker(chord) {
    if (!picker) return
    const line = song.lines.find((l) => l.id === picker.lineId)
    if (!line) return closePicker()
    let chords
    if (picker.mode === 'add') {
      chords = [...line.chords, { id: uid(), position: picker.position, chord }]
    } else {
      chords = line.chords.map((c) => (c.id === picker.chordId ? { ...c, chord } : c))
    }
    updateLine(picker.lineId, { chords })
    closePicker()
  }

  function deletePicker() {
    if (!picker) return
    const line = song.lines.find((l) => l.id === picker.lineId)
    if (!line) return closePicker()
    const chords = line.chords.filter((c) => c.id !== picker.chordId)
    updateLine(picker.lineId, { chords })
    closePicker()
  }

  // Long-press / right-click on a line: reuse the add-line menu, targeted to
  // insert right after that specific line.
  function handleRequestLineMenu(lineId, x, y) {
    const idx = song.lines.findIndex((l) => l.id === lineId)
    setFocusedLineId(lineId)
    openAddMenu(x, y, idx === -1 ? song.lines.length : idx + 1)
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
    openPicker({
      lineId: chordMenu.lineId,
      mode: 'edit',
      chordId: chordMenu.chordId,
      initialValue: chordMenu.chordText,
      anchor: chordMenu.anchor,
    })
    closeChordMenu()
  }
  function handleChordMenuDelete() {
    if (!chordMenu) return
    const line = song.lines.find((l) => l.id === chordMenu.lineId)
    if (line) {
      updateLine(line.id, { chords: line.chords.filter((c) => c.id !== chordMenu.chordId) })
    }
    closeChordMenu()
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
        const patch = { lines: [...song.lines, ...parsed.lines] }
        if (parsed.title) patch.title = parsed.title
        if (parsed.bpm) patch.bpm = parsed.bpm
        if (parsed.timeSignature) patch.timeSignature = parsed.timeSignature
        if (parsed.primaryKey) patch.key = parsed.primaryKey
        onChange(patch)
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

  const groups =
    viewMode === 'chords'
      ? collapseRepeats(song.lines.filter((l) => l.type === 'section' || l.type === 'pagebreak' || l.chords.length > 0))
      : null
  const lineMode = viewMode === 'chords' ? 'chordsOnly' : viewMode === 'lyrics' ? 'lyrics' : 'both'
  const readOnlyChords = viewMode === 'chords'
  const hasAnyChords = groups ? groups.some((g) => g.sequence.length > 0) : true

  // Different sections can carry their own key override; propagate it
  // forward so chord suggestions stay relevant to whichever section a line
  // actually belongs to.
  const effectiveKeys = {}
  {
    let current = song.key
    for (const l of song.lines) {
      if (l.type === 'section' && l.key) current = l.key
      effectiveKeys[l.id] = current
    }
  }

  const lineElements = song.lines.map((line) => (
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
      onRequestLineMenu={handleRequestLineMenu}
      onChordMenu={handleChordMenuRequest}
    />
  ))
  if (addMenu) {
    const idx = Math.max(0, Math.min(addMenu.insertAt, lineElements.length))
    lineElements.splice(idx, 0, <div key="insert-indicator" className="insert-indicator" />)
  }

  return (
    <div className="app" style={scaleStyleVars}>
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <IconChevronLeft />
          Песни
        </button>
        <div className="topbar-title">{song.title || 'Без названия'}</div>
        {!readOnlyChords && (
          <Tooltip label="Импорт из PDF">
            <button className="icon-btn" onClick={handlePickFile} aria-label="Импорт из PDF" disabled={importing}>
              <IconUpload />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Настройки отображения">
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Настройки отображения">
            <IconSettings />
          </button>
        </Tooltip>
        <Tooltip label="Предпросмотр PDF">
          <button
            className="icon-btn"
            onClick={() => setPrintPreview(true)}
            aria-label="Предпросмотр PDF"
          >
            <IconEye />
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

      <MetaBar
        song={song}
        onChange={onChange}
        onTranspose={handleTranspose}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onRequestOriginalKeyReset={handleRequestOriginalKeyReset}
        onResetOriginalKey={handleResetKeyToOriginal}
        onRequestInsertTop={readOnlyChords ? undefined : handleRequestInsertTop}
      />

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

      <div className="canvas" ref={canvasRef}>
        {viewMode === 'chords' && !hasAnyChords && (
          <div className="canvas-hint">В этой песне пока нет аккордов</div>
        )}

        {viewMode === 'chords'
          ? groups.map((g) => {
              const line = song.lines.find((l) => l.id === g.key)
              return <Line key={g.key} line={line} mode="chordsOnly" repeatCount={g.count} />
            })
          : lineElements}

        {!readOnlyChords && (
          <div
            className="canvas-empty-area"
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
          >
            <div className="canvas-hint">
              {importing
                ? 'Импорт PDF…'
                : 'Двойной клик по аккорду — изменить · двойной клик или долгое нажатие — новая строка'}
            </div>
          </div>
        )}
      </div>

      {!readOnlyChords && (
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
          canDelete={picker.mode === 'edit'}
          anchor={picker.anchor}
          onCommit={commitPicker}
          onDelete={deletePicker}
          onClose={closePicker}
        />
      )}

      {drag && (
        <div className="chord-drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.chord.chord}
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
          onClose={closeChordMenu}
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
              «{song.key || '—'}» заменит «{originalKey}» как оригинальная тональность песни.
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

      <EditorSettingsModal
        open={settingsOpen}
        textScale={appliedTextScale}
        onTextScaleChange={onTextScaleChange}
        onClose={() => setSettingsOpen(false)}
        min={TEXT_SCALE_MIN}
        max={TEXT_SCALE_MAX}
        step={TEXT_SCALE_STEP}
      />

      {pendingLineDelete && (
        <UndoBanner
          message="Строка удалена"
          expiresAt={pendingLineDelete.expiresAt}
          onUndo={undoLineDelete}
        />
      )}

      {printPreview && (
        <PrintPreview
          song={song}
          viewMode={viewMode}
          appliedTextScale={appliedTextScale}
          onChange={onChange}
          onClose={() => setPrintPreview(false)}
          onDownload={() => window.print()}
        />
      )}
    </div>
  )
}
