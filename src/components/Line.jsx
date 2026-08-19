import { useEffect, useRef, useState } from 'react'
import { IconClose, IconMusic, IconPageBreak, IconGrip } from './Icons.jsx'
import Tooltip from './Tooltip.jsx'
import { parseChord, noteToSemitone } from '../lib/music.js'

const DRAG_THRESHOLD = 4
const ARM_DELAY_MS = 150
const ARM_CANCEL_THRESHOLD = 10
const DBL_CLICK_MS = 320
const DBL_TAP_MS = 320

// Whether the primary pointer is coarse (touch). Hints and the click-to-add
// shortcut are adapted for touch via this flag; desktop is left untouched.
const isCoarsePointer =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false

// Map a chord string to its root semitone (0-11), for color-coding. Returns
// null for unparseable chords (no color applied).
function chordSemitone(chord) {
  const { root } = parseChord(chord)
  if (root == null) return null
  return noteToSemitone(root)
}

// A tap/long-press that lands inside a text field should preserve the native
// selection + copy/paste menu, so the row's custom context menu and long-press
// handlers must ignore such targets.
function isEditableTarget(e) {
  const el = e.target
  return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'))
}

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
  onLineDragStart,
  draggingLineId,
}) {
  const isSection = line.type === 'section'
  const isPageBreak = line.type === 'pagebreak'
  const fieldValue = isSection ? line.label : line.lyrics
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fieldValue)
  const [editingKey, setEditingKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState(line.key || '')
  const [editingRepeat, setEditingRepeat] = useState(false)
  const [repeatDraft, setRepeatDraft] = useState('')
  const [armedChordId, setArmedChordId] = useState(null)
  const chordGestureRef = useRef(false)
  const gestureEndedAtRef = useRef(0)
  const lastDesktopClickAtRef = useRef(0)
  const lastPointerTypeRef = useRef('mouse')
  const inputRef = useRef(null)
  const keyInputRef = useRef(null)
  const repeatInputRef = useRef(null)
  const chordsStripRef = useRef(null)
  const rowPressTimer = useRef(null)
  const rowLongPressFired = useRef(false)
  const rowLastTapAtRef = useRef(0)
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

  useEffect(() => {
    if (editingRepeat) {
      setRepeatDraft(line.repeatCount ? String(line.repeatCount) : '')
      requestAnimationFrame(() => repeatInputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRepeat])

  function commitRepeat() {
    const trimmed = repeatDraft.trim()
    const n = parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n <= 1) {
      onUpdateLine({ repeatCount: null })
    } else {
      onUpdateLine({ repeatCount: Math.min(n, 99) })
    }
    setEditingRepeat(false)
  }

  function clearRepeat() {
    onUpdateLine({ repeatCount: null })
    setEditingRepeat(false)
  }

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

  function openAddPicker(clientX, clientY, computePosition) {
    const position = computePosition(clientX)
    onOpenPicker({
      lineId: line.id,
      mode: 'add',
      position,
      anchor: { x: clientX, y: clientY },
    })
  }

  function stripPosition(clientX) {
    const rect = chordsStripRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const maxColumns = maxChordColumns()
    return Math.max(0, Math.min(maxColumns, Math.round(x / charWidth)))
  }

  function nextInstrumentalPosition() {
    return line.chords.length ? Math.max(...line.chords.map((c) => c.position)) + 1 : 0
  }

  // Desktop keeps click-to-add a chord. On touch a quick tap must not open the
  // picker (adding a chord on mobile is a long-press — see below).
  function handleChordsStripClick(e) {
    if (lastPointerTypeRef.current === 'touch') return
    openAddPicker(e.clientX, e.clientY, stripPosition)
  }

  function handleInstrumentalBgClick(e) {
    if (lastPointerTypeRef.current === 'touch') return
    openAddPicker(e.clientX, e.clientY, nextInstrumentalPosition)
  }

  // Touch-only long-press on a chord strip / instrumental background to add a
  // new chord — the same hold duration used to "arm" a chord for editing, so
  // the gesture feels consistent. Quick taps fall through to the row's
  // double-tap (add line); the synthesized click is blocked by the touch
  // check in the click handlers above.
  function makeAddLongPressHandler(computePosition) {
    return (downEvent) => {
      if (downEvent.pointerType !== 'touch') return
      // Presses on chord chips/tokens and the drag handle have their own
      // gestures; leave them alone.
      if (downEvent.target.closest?.('.chord-chip, .chord-token, .line-drag-handle')) return
      lastPointerTypeRef.current = 'touch'
      const startX = downEvent.clientX
      const startY = downEvent.clientY
      let canceled = false
      let fired = false
      let holdTimer = null
      const cleanup = () => {
        if (holdTimer) clearTimeout(holdTimer)
        if (fired) {
          chordGestureRef.current = false
          gestureEndedAtRef.current = Date.now()
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      }
      const onMove = (ev) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > ARM_CANCEL_THRESHOLD) {
          canceled = true
          cleanup()
        }
      }
      const onUp = () => cleanup()
      const onCancel = () => cleanup()
      holdTimer = setTimeout(() => {
        if (canceled) return
        fired = true
        // Claim the row gesture so the synthesized contextmenu / pointerup
        // don't double-open the add-line menu.
        chordGestureRef.current = true
        openAddPicker(startX, startY, computePosition)
      }, ARM_DELAY_MS)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    }
  }

  const handleStripAddLongPress = makeAddLongPressHandler(stripPosition)
  const handleInstrumentalAddLongPress = makeAddLongPressHandler(nextInstrumentalPosition)

  // Long-press or right-click anywhere on the row opens the same "add line"
  // menu as the FAB, pre-targeted to insert right after this line. On touch the
  // menu is opened by a double-tap instead of a long press.
  function handleRowPointerDown(e) {
    lastPointerTypeRef.current = e.pointerType
    if (e.button != null && e.button !== 0) return
    if (isEditableTarget(e)) return
    rowLongPressFired.current = false
    if (e.pointerType === 'touch') return
    const x = e.clientX
    const y = e.clientY
    rowPressTimer.current = setTimeout(() => {
      rowLongPressFired.current = true
      onRequestLineMenu && onRequestLineMenu(line.id, x, y)
    }, 500)
  }
  function handleRowPointerUp(e) {
    clearTimeout(rowPressTimer.current)
    if (e.pointerType !== 'touch') return
    if (isEditableTarget(e)) return
    // A tap that landed on a chord chip belongs to the chord gesture — don't
    // count it toward the row double-tap so chord long-press never blocks
    // line insertion.
    if (chordGestureRef.current || e.target.closest?.('.chord-chip, .chord-token')) return
    const now = Date.now()
    if (now - rowLastTapAtRef.current < DBL_TAP_MS) {
      rowLastTapAtRef.current = 0
      rowLongPressFired.current = true
      onRequestLineMenu && onRequestLineMenu(line.id, e.clientX, e.clientY)
    } else {
      rowLastTapAtRef.current = now
    }
  }
  function cancelRowPress() {
    clearTimeout(rowPressTimer.current)
  }
  function handleRowContextMenu(e) {
    if (isEditableTarget(e)) return
    e.preventDefault()
    // On touch, a long press fires a synthetic contextmenu while the finger
    // is still down (or right after release). The pointer gesture (strip
    // long-press to add a chord, or the row double-tap) opens its own menu,
    // so ignore the synthetic event — but still suppress the native callout.
    if (chordGestureRef.current || Date.now() - gestureEndedAtRef.current < 400) return
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
        onChordDragStart({ line, chord, clientX: ev.clientX, clientY: ev.clientY, grabOffsetX, shiftKey: ev.shiftKey })
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

  // Desktop-only drag of a whole instrumental line: reorders it within the
  // song, or — with Shift held — drops a copy instead of moving. Touch is
  // intentionally not supported here.
  function handleLineDragPointerDown(downEvent) {
    if (downEvent.pointerType === 'touch') return
    if (downEvent.button != null && downEvent.button !== 0) return
    downEvent.stopPropagation()
    const startX = downEvent.clientX
    const startY = downEvent.clientY
    let dragging = false
    let canceled = false

    function onMove(ev) {
      if (canceled) return
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
        dragging = true
        cleanup()
        onLineDragStart &&
          onLineDragStart({ line, clientX: ev.clientX, clientY: ev.clientY, shiftKey: ev.shiftKey })
      }
    }
    function onUp() {
      cleanup()
    }
    function onCancel() {
      cleanup()
      canceled = true
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
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
        onPointerUp={readOnly ? undefined : handleRowPointerUp}
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
        onPointerUp={readOnly ? undefined : handleRowPointerUp}
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
              <span className="chord-token" data-chord-semitone={chordSemitone(c.chord) ?? undefined}>
                {c.chord}
              </span>
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
        className={'line-row' + (isFocused ? ' is-focused' : '') + (draggingLineId === line.id ? ' is-dragging' : '')}
        data-line-id={line.id}
        data-line-type="chords"
        data-line-mode={mode}
        onClickCapture={handleRowClickCapture}
        onPointerDown={handleRowPointerDown}
        onPointerUp={handleRowPointerUp}
        onPointerLeave={cancelRowPress}
        onPointerCancel={cancelRowPress}
        onContextMenu={handleRowContextMenu}
      >
        <div className="line-content">
          <div
            className="chords-only-row editable"
            onClick={handleInstrumentalBgClick}
            onPointerDown={handleInstrumentalAddLongPress}
          >
            <IconGrip
              className="line-drag-handle"
              onPointerDown={handleLineDragPointerDown}
              onClick={(e) => e.stopPropagation()}
            />
            <IconMusic className="instrumental-icon" />
            {sortedChords.length === 0 && (
              <span className="instrumental-hint">
                {isCoarsePointer ? 'Проигрыш — долгое нажатие, чтобы добавить аккорд' : 'Проигрыш — нажмите, чтобы добавить аккорд'}
              </span>
            )}
            {sortedChords.map((c, i) => (
              <span key={c.id}>
                {i > 0 && <span className="sep">|</span>}
                <span
                  className={'chord-token' + (armedChordId === c.id ? ' is-armed' : '')}
                  data-chord-semitone={chordSemitone(c.chord) ?? undefined}
                  style={draggingChordId === c.id ? { opacity: 0.25 } : undefined}
                  onPointerDown={(e) => handleChordPointerDown(e, c)}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => handleChordContextMenu(e, c)}
                >
                  {c.chord}
                </span>
              </span>
            ))}
            {editingRepeat ? (
              <span
                className="repeat-control"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="repeat-control-sign">×</span>
                <input
                  ref={repeatInputRef}
                  className="repeat-input"
                  type="number"
                  min={2}
                  max={99}
                  inputMode="numeric"
                  value={repeatDraft}
                  placeholder="2"
                  onChange={(e) => setRepeatDraft(e.target.value)}
                  onBlur={commitRepeat}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitRepeat()
                    } else if (e.key === 'Escape') {
                      setEditingRepeat(false)
                    }
                  }}
                />
                {line.repeatCount > 1 && (
                  <button
                    type="button"
                    className="repeat-clear"
                    onClick={clearRepeat}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Убрать повторы"
                    title="Убрать повторы"
                  >
                    <IconClose />
                  </button>
                )}
              </span>
            ) : (
              <button
                type="button"
                className={'repeat-pill' + (line.repeatCount > 1 ? '' : ' is-empty')}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingRepeat(true)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title={line.repeatCount > 1 ? 'Изменить количество повторов' : 'Добавить количество повторов'}
              >
                {line.repeatCount > 1 ? `×${line.repeatCount}` : '× повтор'}
              </button>
            )}
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
      onPointerUp={handleRowPointerUp}
      onPointerLeave={cancelRowPress}
      onPointerCancel={cancelRowPress}
      onContextMenu={handleRowContextMenu}
    >
      <div className="line-content">
        {mode === 'both' && (
          <div
            className="chords-strip"
            ref={chordsStripRef}
            onClick={handleChordsStripClick}
            onPointerDown={handleStripAddLongPress}
          >
            {sortedChords.map((c) => (
              <span
                key={c.id}
                className={'chord-chip' + (armedChordId === c.id ? ' is-armed' : '')}
                data-chord-semitone={chordSemitone(c.chord) ?? undefined}
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
