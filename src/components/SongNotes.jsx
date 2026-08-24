import { useCallback, useEffect, useRef, useState } from 'react'
import { IconLink, IconLinkOff } from './Icons.jsx'
import { readNote, writeNote } from '../lib/notes.js'
import { isEmptyNotesHtml, safeHref, sanitizeNotesHtml } from '../lib/notesHtml.js'

// Long enough that typing a sentence is one write, short enough that closing
// the tab right after typing never races the save (unmount flushes anyway).
const SAVE_DEBOUNCE_MS = 500

// A note lives on this device only — see lib/notes.js. It is deliberately not
// governed by the edit lock: the lock exists to keep a stray touch on a music
// stand from rewriting the shared song, and a note reaches neither the server
// nor anybody else.
export default function SongNotes({ songId, onEmptyChange }) {
  const editorRef = useRef(null)
  const songIdRef = useRef(songId)
  const dirtyRef = useRef(false)
  // The last known contents, kept alongside the DOM rather than read from it
  // at save time. React detaches `editorRef` before the unmount cleanup runs,
  // so a flush that reads the element would find nothing there and overwrite
  // the note with an empty one — which is exactly what leaving the tab does.
  const latestHtml = useRef('')
  const saveTimer = useRef(null)
  const savedRange = useRef(null)
  // Held in a ref, not read as a dependency: the load effect below rewrites
  // innerHTML, and re-running it because the parent re-created a callback
  // would wipe the caret out from under whoever is typing.
  const onEmptyChangeRef = useRef(onEmptyChange)
  onEmptyChangeRef.current = onEmptyChange
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(true)
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, strike: false, link: false })
  // null — the link bar is closed; a string — it is open with that value.
  const [linkDraft, setLinkDraft] = useState(null)
  const linkInputRef = useRef(null)

  songIdRef.current = songId

  // Takes the song explicitly: on a song switch React renders with the new id
  // before it runs the old effect's cleanup, so a save that read the current
  // id would file the previous song's note under the new one.
  const saveNow = useCallback((forSongId) => {
    clearTimeout(saveTimer.current)
    if (!dirtyRef.current) return
    dirtyRef.current = false
    const html = sanitizeNotesHtml(latestHtml.current)
    void writeNote(forSongId, isEmptyNotesHtml(html) ? '' : html)
  }, [])

  const flush = useCallback(() => saveNow(songIdRef.current), [saveNow])

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    latestHtml.current = html
    const isEmpty = isEmptyNotesHtml(html)
    setEmpty(isEmpty)
    onEmptyChangeRef.current?.(isEmpty)
    dirtyRef.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }, [flush])

  // The editor is uncontrolled — React must never re-render its contents from
  // under the caret — so loading is a one-off innerHTML write per song.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLinkDraft(null)
    readNote(songId).then((note) => {
      if (cancelled) return
      const html = sanitizeNotesHtml(note?.html || '')
      if (editorRef.current) editorRef.current.innerHTML = html
      latestHtml.current = html
      dirtyRef.current = false
      const isEmpty = isEmptyNotesHtml(html)
      setEmpty(isEmpty)
      onEmptyChangeRef.current?.(isEmpty)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [songId])

  // Leaving the tab, closing the app, or switching to another song must not
  // drop the half-second of typing the debounce is still holding.
  useEffect(() => {
    return () => saveNow(songId)
  }, [songId, saveNow])

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flush])

  // Toolbar state follows the caret.
  useEffect(() => {
    function onSelectionChange() {
      const el = editorRef.current
      if (!el) return
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
      setFormat({
        bold: queryState('bold'),
        italic: queryState('italic'),
        underline: queryState('underline'),
        strike: queryState('strikeThrough'),
        link: Boolean(closestAnchor(sel.anchorNode, el)),
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  useEffect(() => {
    if (linkDraft !== null) linkInputRef.current?.focus()
  }, [linkDraft !== null])

  function exec(command, value) {
    const el = editorRef.current
    if (!el) return
    el.focus()
    // Tags, not inline styles: the sanitiser keeps <b>/<i>/<u> and throws
    // style attributes away, so a CSS-styled span would silently do nothing.
    try {
      document.execCommand('styleWithCSS', false, false)
    } catch {
      // Not supported everywhere; the command below still works.
    }
    document.execCommand(command, false, value)
    handleInput()
  }

  function restoreRange() {
    const range = savedRange.current
    if (!range) return
    const sel = document.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function openLinkBar() {
    const el = editorRef.current
    if (!el) return
    const sel = document.getSelection()
    let existing = ''
    savedRange.current = null
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const anchor = closestAnchor(sel.anchorNode, el)
      if (anchor) {
        // Editing an existing link: take the whole anchor, so the new address
        // replaces it instead of splitting it in two.
        existing = anchor.getAttribute('href') || ''
        const range = document.createRange()
        range.selectNodeContents(anchor)
        savedRange.current = range
      } else {
        savedRange.current = sel.getRangeAt(0).cloneRange()
      }
    }
    setLinkDraft(existing)
  }

  function applyLink() {
    const el = editorRef.current
    const url = safeHref(linkDraft)
    if (!el || !url) return
    el.focus()
    restoreRange()
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed) {
      // Nothing selected: the address becomes its own text.
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(linkDraft.trim())}</a>&nbsp;`)
    } else {
      document.execCommand('createLink', false, url)
    }
    markAnchors(el)
    setLinkDraft(null)
    savedRange.current = null
    handleInput()
  }

  function removeLink() {
    const el = editorRef.current
    if (!el) return
    el.focus()
    restoreRange()
    document.execCommand('unlink')
    setLinkDraft(null)
    savedRange.current = null
    handleInput()
  }

  // Paste and drop are the two ways foreign markup gets in; both are cleaned
  // before insertion, so the DOM never holds anything the store would reject.
  function insertTransfer(data) {
    const html = data.getData('text/html')
    if (html) {
      document.execCommand('insertHTML', false, sanitizeNotesHtml(html))
      return
    }
    const text = data.getData('text/plain') || ''
    document.execCommand('insertHTML', false, textToHtml(text))
  }

  function handlePaste(e) {
    e.preventDefault()
    insertTransfer(e.clipboardData)
    handleInput()
  }

  function handleDrop(e) {
    e.preventDefault()
    insertTransfer(e.dataTransfer)
    handleInput()
  }

  function handleKeyDown(e) {
    // Enter stays an ordinary line break — no list, no quote, no autoformat.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase()
      if (e.shiftKey && key === 'x') {
        e.preventDefault()
        exec('strikeThrough')
      } else if (key === 'b') {
        e.preventDefault()
        exec('bold')
      } else if (key === 'i') {
        e.preventDefault()
        exec('italic')
      } else if (key === 'u') {
        e.preventDefault()
        exec('underline')
      } else if (key === 'k') {
        e.preventDefault()
        openLinkBar()
      }
    }
  }

  const linkValid = linkDraft !== null && Boolean(safeHref(linkDraft))

  return (
    <div className="notes">
      <div className="notes-toolbar" role="toolbar" aria-label="Форматирование">
        <button
          type="button"
          className={'notes-tool' + (format.bold ? ' is-active' : '')}
          style={{ fontWeight: 700 }}
          aria-label="Жирный"
          aria-pressed={format.bold}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('bold')}
        >
          Ж
        </button>
        <button
          type="button"
          className={'notes-tool' + (format.italic ? ' is-active' : '')}
          style={{ fontStyle: 'italic' }}
          aria-label="Курсив"
          aria-pressed={format.italic}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('italic')}
        >
          К
        </button>
        <button
          type="button"
          className={'notes-tool' + (format.underline ? ' is-active' : '')}
          style={{ textDecoration: 'underline' }}
          aria-label="Подчёркнутый"
          aria-pressed={format.underline}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('underline')}
        >
          Ч
        </button>
        <button
          type="button"
          className={'notes-tool' + (format.strike ? ' is-active' : '')}
          style={{ textDecoration: 'line-through' }}
          aria-label="Зачёркнутый"
          aria-pressed={format.strike}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('strikeThrough')}
        >
          З
        </button>
        <span className="notes-tool-sep" aria-hidden />
        <button
          type="button"
          className={'notes-tool' + (format.link ? ' is-active' : '')}
          aria-label="Ссылка"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkBar}
        >
          <IconLink />
        </button>
        {format.link && (
          <button
            type="button"
            className="notes-tool"
            aria-label="Убрать ссылку"
            onMouseDown={(e) => e.preventDefault()}
            onClick={removeLink}
          >
            <IconLinkOff />
          </button>
        )}
      </div>

      {linkDraft !== null && (
        <div className="notes-link-bar">
          <input
            ref={linkInputRef}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={linkDraft}
            aria-label="Адрес ссылки"
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (linkValid) applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setLinkDraft(null)
              }
            }}
          />
          <button type="button" className="ghost-btn" onClick={() => setLinkDraft(null)}>
            Отмена
          </button>
          <button type="button" className="accent-btn" disabled={!linkValid} onClick={applyLink}>
            Готово
          </button>
        </div>
      )}

      <div
        ref={editorRef}
        className="notes-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Заметки к песне"
        spellCheck
        data-placeholder="Заметки к песне — только на этом устройстве"
        data-empty={!loading && empty ? 'true' : 'false'}
        onInput={handleInput}
        onBlur={flush}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

function queryState(command) {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

function closestAnchor(node, root) {
  let current = node
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && current.tagName === 'A') return current
    current = current.parentNode
  }
  return null
}

// `createLink` leaves a bare <a href>; the sanitiser would add these on the
// next load anyway, doing it now means the link behaves right immediately.
function markAnchors(root) {
  for (const anchor of root.querySelectorAll('a')) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToHtml(text) {
  return escapeHtml(text).split(/\r\n|\r|\n/).join('<br>')
}
