import { useEffect, useRef, useState } from 'react'
import { IconClose, IconMusic, IconPageBreak } from './Icons.jsx'
import Tooltip from './Tooltip.jsx'

const DRAG_THRESHOLD = 4
const ARM_DELAY_MS = 150
const ARM_CANCEL_THRESHOLD = 10
const DBL_CLICK_MS = 320

export default function Line({
  line,
  mode,
  charWidth,
  repeatCount = 1,
  draggingChordId,
  isFocused,
  onFocusLine,
  onUpdateLine,
  onOpenPicker,
  onDeleteLine,
  onChordDragStart,
  onRequestLineMenu,
  onChordMenu,
}) {
  const isSection = line.type === 'section'
  const isPageBreak = line.type === 'pagebreak'
  const fieldValue = isSection ? line.label : line.lyrics
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fieldValue)
  const [editingKey, setEditingKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState(line.key || '')
  const [armedChordId, setArmedChordId] = useState(null)
  const chordGestureRef = useRef(false)
  const gestureEndedAtRef = useRef(0)
  const lastDesktopClickAtRef = useRef(0)
  const inputRef = useRef(null)
  const keyInputRef = useRef(null)
  const chordsStripRef = useRef(null)
  const rowPressTimer = useRef(null)
  const rowLongPressFired = useRef(false)
  const sortedChords = [...line.chords].sort((a, b) => a.position - b.position)

  useEffect(() => {
    if (editing) {
      setDraft(fieldValue)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (editingKey) {
      setKeyDraft(line.key || '')
      requestAnimationFrame(() => keyInputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey])

  function commitKey() {
    const trimmed = keyDraft.trim()
    onUpdateLine({ key: trimmed || null })
    setEditingKey(false)
  }

  function commitField() {
    if (isSection) {
      onUpdateLine({ label: draft })
    } else {
      onUpdateLine({ lyrics: draft })
    }
    setEditing(false)
  }

  function maxChordColumns() {
    const lyricsLength = typeof line.lyrics === 'string' ? line.lyrics.length : 0
    const stripRect = chordsStripRef.current?.getBoundingClientRect()
    const widthColumns = stripRect ? Math.round(stripRect.width / charWidth) : 0
    const chordExtent = sortedChords.length ? Math.max(...sortedChords.map((c) => c.position)) : 0
    return Math.max(lyricsLength, widthColumns, chordExtent)
  }

  function handleStripBackgroundClick(e, computePosition) {
    const position = computePosition(e)
    onOpenPicker({
      lineId: line.id,
      mode: 'add',
      position,
      anchor: { x: e.clientX, y: e.clientY },
    })
  }

  function handleChordsStripClick(e) {
    handleStripBackgroundClick(e, (ev) => {
      const rect = chordsStripRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const maxColumns = maxChordColumns()
      return Math.max(0, Math.min(maxColumns, Math.round(x / charWidth)))
    })
  }

  function handleInstrumentalBgClick(e) {
    const nextPos = line.chords.length ? Math.max(...line.chords.map((c) => c.position)) + 1 : 0
    handleStripBackgroundClick(e, () => nextPos)
  }

  // Long-press or right-click anywhere on the row opens the same "add line"
  // menu as the FAB, pre-targeted to insert right after this line.
  function handleRowPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    rowLongPressFired.current = false
    const x = e.clientX
    const y = e.clientY
    rowPressTimer.current = setTimeout(() => {
      rowLongPressFired.current = true
      onRequestLineMenu && onRequestLineMenu(line.id, x, y)
    }, 500)
  }
  function cancelRowPress() {
    clearTimeout(rowPressTimer.current)
  }
  function handleRowContextMenu(e) {
    e.preventDefault()
    onRequestLineMenu && onRequestLineMenu(line.id, e.clientX, e.clientY)
  }
  function handleRowClickCapture(e) {
    onFocusLine && onFocusLine(line.id)
    if (rowLongPressFired.current) {
      rowLongPressFired.current = false
      e.stopPropagation()
    }
  }

  // Two interaction models split by pointer type:
  //  - Touch: a quick tap does nothing (so the page can scroll and the chord
  //    never flies away). Holding ~150ms "arms" the chord (it blinks, page
  //    scroll is locked via a body-level lock). Moving an armed chord drags it;
  //    releasing it without moving opens the Edit/Delete menu.
  //  - Mouse: drag starts immediately on movement (as before); a double-click
  //    opens the edit picker directly; right-click opens the context menu
  //    (handled in handleChordContextMenu). No long-press behavior.
  function handleChordPointerDown(downEvent, chord) {
    downEvent.stopPropagation()
    if (downEvent.button != null && downEvent.button !== 0) return
    const isTouch = downEvent.pointerType === 'touch'
    chordGestureRef.current = true
    const chipEl = downEvent.currentTarget
    const pointerId = downEvent.pointerId
    const startX = downEvent.clientX
    const startY = downEvent.clientY
    const chordRect = chipEl?.getBoundingClientRect()
    const grabOffsetX = chordRect ? downEvent.clientX - chordRect.left : 0
    let dragging = false
    let armed = false
    let canceled = false
    let holdTimer = null

    // Lock the pointer to the chip for the entire touch so the browser keeps
    // delivering pointer events (no pointercancel from scrolling/system
    // gestures). Auto-released on pointerup/pointercancel.
    if (isTouch && chipEl && typeof chipEl.setPointerCapture === 'function') {
      try {
        chipEl.setPointerCapture(pointerId)
      } catch {
        // ignore — capture is best-effort
      }
    }

    function arm() {
      armed = true
      setArmedChordId(chord.id)
    }
    function disarm() {
      setArmedChordId((cur) => (cur === chord.id ? null : cur))
    }

    if (isTouch) {
      holdTimer = setTimeout(() => {
        if (canceled) return
        arm()
      }, ARM_DELAY_MS)
    }

    function cleanup() {
      chordGestureRef.current = false
      gestureEndedAtRef.current = Date.now()
      if (holdTimer) clearTimeout(holdTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }

    function openEdit(c, x, y) {
      onOpenPicker &&
        onOpenPicker({
          lineId: line.id,
          mode: 'edit',
          chordId: c.id,
          initialValue: c.chord,
          anchor: { x, y },
        })
    }

    function openMenu(c, x, y) {
      onChordMenu &&
        onChordMenu({
          lineId: line.id,
          chordId: c.id,
          chordText: c.chord,
          anchor: { x, y },
        })
    }

    function onMove(ev) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (isTouch && !armed) {
        if (Math.hypot(dx, dy) > ARM_CANCEL_THRESHOLD) {
          canceled = true
          cleanup()
        }
        return
      }
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragging = true
        if (armed) disarm()
        cleanup()
        onChordDragStart({ line, chord, clientX: ev.clientX, clientY: ev.clientY, grabOffsetX })
      }
    }

    function onUp(ev) {
      cleanup()
      if (dragging) return
      if (isTouch) {
        if (armed) {
          disarm()
          openMenu(chord, ev.clientX, ev.clientY)
        }
        return
      }
      // Desktop: double-click opens the edit picker.
      const now = Date.now()
      if (now - lastDesktopClickAtRef.current < DBL_CLICK_MS) {
        lastDesktopClickAtRef.current = 0
        openEdit(chord, ev.clientX, ev.clientY)
      } else {
        lastDesktopClickAtRef.current = now
      }
    }

    function onCancel() {
      cleanup()
      disarm()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  function handleChordContextMenu(e, chord) {
    e.preventDefault()
    e.stopPropagation()
    // On touch, a long press fires a synthetic contextmenu while the finger
    // is still down (or right after release). Ignore it — the pointer gesture
    // opens the menu on release. Only a real desktop right-click (no recent
    // gesture) opens here.
    if (chordGestureRef.current || Date.now() - gestureEndedAtRef.current < 400) return
    onChordMenu &&
      onChordMenu({
        lineId: line.id,
        chordId: chord.id,
        chordText: chord.chord,
        anchor: { x: e.clientX, y: e.clientY },
      })
  }

  function renderDeleteButton(label) {
    return (
      <Tooltip label={label}>
        <button
          className="line-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteLine()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={label}
        >
          <IconClose />
        </button>
      </Tooltip>
    )
  }

  // Page break — a non-content divider that forces a new PDF page. Renders
  // identically in every view mode; only editable to the extent that it can
  // be deleted or dragged around like any other line.
  if (isPageBreak) {
    const readOnly = mode === 'chordsOnly'
    return (
      <div
        className={'line-row pagebreak-row' + (isFocused ? ' is-focused' : '')}
        data-line-id={line.id}
        data-line-type="pagebreak"
        data-line-mode={mode}
        onClickCapture={readOnly ? undefined : handleRowClickCapture}
        onPointerDown={readOnly ? undefined : handleRowPointerDown}
        onPointerUp={readOnly ? undefined : cancelRowPress}
        onPointerLeave={readOnly ? undefined : cancelRowPress}
        onPointerCancel={readOnly ? undefined : cancelRowPress}
        onContextMenu={readOnly ? undefined : handleRowContextMenu}
      >
        <div className="line-content pagebreak-content">
          <span className="pagebreak-line" />
          <IconPageBreak className="pagebreak-icon" />
          <span className="pagebreak-label">Разрыв страницы</span>
          <span className="pagebreak-line" />
        </div>
        {!readOnly && renderDeleteButton('Удалить разрыв страницы')}
      </div>
    )
  }

  // Section marker rows (Verse / Chorus / Bridge…) render the same way in
  // every view mode; only editability changes in the read-only chords view.
  if (isSection) {
    const readOnly = mode === 'chordsOnly'
    return (
      <div
        className={'line-row section-row' + (isFocused ? ' is-focused' : '')}
        data-line-id={line.id}
        data-line-type="section"
        data-line-mode={mode}
        onClickCapture={readOnly ? undefined : handleRowClickCapture}
        onPointerDown={readOnly ? undefined : handleRowPointerDown}
        onPointerUp={readOnly ? undefined : cancelRowPress}
        onPointerLeave={readOnly ? undefined : cancelRowPress}
        onPointerCancel={readOnly ? undefined : cancelRowPress}
        onContextMenu={readOnly ? undefined : handleRowContextMenu}
      >
        <div className="line-content section-content">
          {editing ? (
            <input
              ref={inputRef}
              className="section-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitField}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitField()
                } else if (e.key === 'Escape') {
                  setEditing(false)
                }
              }}
            />
          ) : (
            <div
              className={'section-label' + (line.label ? '' : ' is-empty')}
              onClick={readOnly ? undefined : () => setEditing(true)}
            >
              {line.label || (readOnly ? 'Раздел' : 'Название раздела…')}
            </div>
          )}

          {readOnly
            ? line.key && <span className="section-key-pill readonly">{line.key}</span>
            : editingKey ? (
                <input
                  ref={keyInputRef}
                  className="section-key-input"
                  value={keyDraft}
                  placeholder="Тон."
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onBlur={commitKey}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitKey()
                    } else if (e.key === 'Escape') {
                      setEditingKey(false)
                    }
                  }}
                />
              ) : (
                <button
                  className={'section-key-pill' + (line.key ? '' : ' is-empty')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingKey(true)
                  }}
                >
                  {line.key || '+ тон.'}
                </button>
              )}
        </div>
        {!readOnly && renderDeleteButton('Удалить раздел')}
      </div>
    )
  }

  if (mode === 'chordsOnly') {
    return (
      <div className="line-row" data-line-id={line.id} data-line-mode="chordsOnly">
        <div className="chords-only-row">
          {sortedChords.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="sep">|</span>}
              <span className="chord-token">{c.chord}</span>
            </span>
          ))}
          {repeatCount > 1 && <span className="repeat-tag">×{repeatCount}</span>}
        </div>
      </div>
    )
  }

  // Purely-instrumental lines (intro, coda, break…) — an editable sequence of
  // chords with no lyrics attached, so nothing to visually anchor them to.
  if (line.type === 'chords' && mode === 'lyrics') {
    return null
  }

  if (line.type === 'chords') {
    return (
      <div
        className={'line-row' + (isFocused ? ' is-focused' : '')}
        data-line-id={line.id}
        data-line-type="chords"
        data-line-mode={mode}
        onClickCapture={handleRowClickCapture}
        onPointerDown={handleRowPointerDown}
        onPointerUp={cancelRowPress}
        onPointerLeave={cancelRowPress}
        onPointerCancel={cancelRowPress}
        onContextMenu={handleRowContextMenu}
      >
        <div className="line-content">
          <div className="chords-only-row editable" onClick={handleInstrumentalBgClick}>
            <IconMusic className="instrumental-icon" />
            {sortedChords.length === 0 && <span className="instrumental-hint">Проигрыш — нажмите, чтобы добавить аккорд</span>}
            {sortedChords.map((c, i) => (
              <span key={c.id}>
                {i > 0 && <span className="sep">|</span>}
                <span
                  className={'chord-token' + (armedChordId === c.id ? ' is-armed' : '')}
                  style={draggingChordId === c.id ? { opacity: 0.25 } : undefined}
                  onPointerDown={(e) => handleChordPointerDown(e, c)}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => handleChordContextMenu(e, c)}
                >
                  {c.chord}
                </span>
              </span>
            ))}
          </div>
        </div>
        {renderDeleteButton('Удалить строку')}
      </div>
    )
  }

  return (
    <div
      className={'line-row' + (isFocused ? ' is-focused' : '')}
      data-line-id={line.id}
      data-line-mode={mode}
      onClickCapture={handleRowClickCapture}
      onPointerDown={handleRowPointerDown}
      onPointerUp={cancelRowPress}
      onPointerLeave={cancelRowPress}
      onPointerCancel={cancelRowPress}
      onContextMenu={handleRowContextMenu}
    >
      <div className="line-content">
        {mode === 'both' && (
          <div className="chords-strip" ref={chordsStripRef} onClick={handleChordsStripClick}>
            {sortedChords.map((c) => (
              <span
                key={c.id}
                className={'chord-chip' + (armedChordId === c.id ? ' is-armed' : '')}
                style={{ left: c.position * charWidth, opacity: draggingChordId === c.id ? 0.25 : 1 }}
                onPointerDown={(e) => handleChordPointerDown(e, c)}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => handleChordContextMenu(e, c)}
              >
                {c.chord}
              </span>
            ))}
          </div>
        )}

        {editing ? (
          <input
            ref={inputRef}
            className="lyrics-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitField}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitField()
              } else if (e.key === 'Escape') {
                setEditing(false)
              }
            }}
          />
        ) : (
          <div
            className={'lyrics-strip' + (line.lyrics ? '' : ' is-empty')}
            data-placeholder="Нажмите, чтобы ввести текст…"
            onClick={() => setEditing(true)}
          >
            {line.lyrics}
          </div>
        )}
      </div>

      {renderDeleteButton('Удалить строку')}
    </div>
  )
}
