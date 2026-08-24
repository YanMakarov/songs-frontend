import { useCallback, useEffect, useRef, useState } from 'react'
import { IconGrip, IconPlus, IconTrash, IconSettings, IconMusic } from './Icons.jsx'
import ThemeMenu from './ThemeMenu.jsx'
import Tooltip from './Tooltip.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import LockButton from './LockButton.jsx'
import LockNotice from './LockNotice.jsx'
import UndoBanner from './UndoBanner.jsx'
import { noteToSemitone, parseKey } from '../lib/music.js'

// Root semitone of a song's key (0-11), or null when it is missing or not a
// key we can parse. Only used to tint the label in the colour chord style —
// the same palette the chords themselves use, so a glance at the list and a
// glance at the song agree on what colour the tonality is.
function keySemitone(key) {
  const { tonic, valid } = parseKey(key)
  if (!valid) return null
  return noteToSemitone(tonic)
}

function metaExtras(song) {
  const parts = []
  if (song.bpm) parts.push(`${song.bpm} BPM`)
  if (song.timeSignature) parts.push(song.timeSignature)
  return parts.join(' · ')
}

function SongMeta({ song }) {
  const key = (song.key || '').trim()
  const extras = metaExtras(song)
  if (!key && !extras) return null
  return (
    <div className="song-card-meta">
      {key && (
        <span className="song-card-key" data-chord-semitone={keySemitone(key) ?? undefined}>
          {key}
        </span>
      )}
      {key && extras ? ' · ' : null}
      {extras}
    </div>
  )
}

export default function SongList({
  songs,
  loading = false,
  error = null,
  onRetry,
  onOpen,
  onCreate,
  creating = false,
  onDelete,
  onUndoDelete,
  pendingDelete,
  onReorder,
  remoteChanges,
  setlist,
  onSetlistRename,
  theme,
  onThemeChange,
  onOpenSettings,
  onOpenLibrary,
}) {
  const [draggingId, setDraggingId] = useState(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const titleInputRef = useRef(null)
  const listRef = useRef(null)
  const cardRefs = useRef(new Map())
  const dragStateRef = useRef(null)
  const dragMovedRef = useRef(false)
  const ghostRef = useRef(null)
  const isInteractive = !loading && !error

  useEffect(() => {
    if (editingTitle) {
      setTitleDraft(setlist?.name || '')
      requestAnimationFrame(() => {
        titleInputRef.current?.focus()
        titleInputRef.current?.select()
      })
    }
  }, [editingTitle, setlist])

  function commitTitle() {
    const trimmed = (titleDraft || '').trim()
    setEditingTitle(false)
    if (!trimmed) return
    if (trimmed === (setlist?.name || '')) return
    onSetlistRename?.(trimmed)
  }

  function getDestinationIndex(targetId, position) {
    if (!draggingId || draggingId === targetId) return null
    const sourceIndex = songs.findIndex((s) => s.id === draggingId)
    const targetIndex = songs.findIndex((s) => s.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1) return null

    let destinationIndex = targetIndex
    if (position === 'after') {
      destinationIndex += 1
    }

    if (destinationIndex > songs.length) {
      destinationIndex = songs.length
    }

    if (destinationIndex > sourceIndex) {
      destinationIndex -= 1
    }

    if (destinationIndex === sourceIndex) {
      return null
    }

    return destinationIndex
  }

  function computeDropTarget(clientY) {
    const cards = listRef.current ? listRef.current.querySelectorAll('[data-song-id]') : null
    if (!cards) return null
    let lastCard = null
    for (const el of cards) {
      const id = el.getAttribute('data-song-id')
      const rect = el.getBoundingClientRect()
      lastCard = { id, rect }
      if (id === draggingId) continue
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const position = clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        return { id, position }
      }
    }
    if (lastCard && clientY < lastCard.rect.top) {
      return { id: lastCard.id, position: 'before' }
    }
    if (lastCard && clientY > lastCard.rect.bottom) {
      return { id: lastCard.id, position: 'after' }
    }
    return null
  }

  const endDrag = useCallback((commit) => {
    const state = dragStateRef.current
    const indicator = dropIndicator
    dragStateRef.current = null

    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
    if (state?.handle && state.pointerId != null) {
      try {
        state.handle.releasePointerCapture(state.pointerId)
      } catch {
        // ignore
      }
    }

    if (commit && state && indicator) {
      const destinationIndex = getDestinationIndex(indicator.id, indicator.position)
      if (destinationIndex != null) {
        onReorder?.(state.songId, destinationIndex)
      }
    }

    setDraggingId(null)
    setDropIndicator(null)
  }, [dropIndicator, draggingId, songs, onReorder])

  function handleHandlePointerDown(event, songId) {
    if (!isInteractive) return
    if (event.button != null && event.button !== 0) return
    const handle = event.currentTarget
    const card = cardRefs.current.get(songId)
    if (!card) return

    event.preventDefault()
    event.stopPropagation()

    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }

    dragStateRef.current = {
      songId,
      handle,
      pointerId: event.pointerId,
      offsetX: event.clientX - card.getBoundingClientRect().left,
      offsetY: event.clientY - card.getBoundingClientRect().top,
    }
    dragMovedRef.current = false
    setDraggingId(songId)
    setDropIndicator(null)

    const ghost = card.cloneNode(true)
    ghost.classList.add('song-card-ghost')
    ghost.style.position = 'fixed'
    ghost.style.left = `${event.clientX - dragStateRef.current.offsetX}px`
    ghost.style.top = `${event.clientY - dragStateRef.current.offsetY}px`
    ghost.style.width = `${card.getBoundingClientRect().width}px`
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '1000'
    document.body.appendChild(ghost)
    ghostRef.current = ghost
  }

  function handleHandlePointerMove(event) {
    const state = dragStateRef.current
    if (!state || event.pointerId !== state.pointerId) return
    event.preventDefault()
    dragMovedRef.current = true

    if (ghostRef.current) {
      ghostRef.current.style.left = `${event.clientX - state.offsetX}px`
      ghostRef.current.style.top = `${event.clientY - state.offsetY}px`
    }

    const target = computeDropTarget(event.clientY)
    setDropIndicator((prev) => {
      if (prev && target && prev.id === target.id && prev.position === target.position) {
        return prev
      }
      return target
    })
  }

  function handleHandlePointerUp(event) {
    const state = dragStateRef.current
    if (!state || event.pointerId !== state.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    endDrag(true)
  }

  function handleHandlePointerCancel(event) {
    const state = dragStateRef.current
    if (!state || event.pointerId !== state.pointerId) return
    endDrag(false)
  }

  function handleCardClick(songId, event) {
    if (event.target.closest && event.target.closest('.song-card-handle')) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (draggingId) return
    onOpen(songId)
  }

  return (
    <div className="app">
      <div className="topbar">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="topbar-title-input"
            value={titleDraft}
            placeholder="Название сетлиста"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTitle()
              } else if (e.key === 'Escape') {
                setEditingTitle(false)
              }
            }}
          />
        ) : (
          <button
            className="topbar-title"
            type="button"
            onClick={() => setEditingTitle(true)}
            aria-label="Редактировать название сетлиста"
          >
            {setlist?.name || 'Set list'}
          </button>
        )}
        {onOpenLibrary && (
          <Tooltip label="Библиотека аппликатур">
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenLibrary}
              aria-label="Библиотека аппликатур"
            >
              <IconMusic />
            </button>
          </Tooltip>
        )}
        <LockButton />
        {onOpenSettings && (
          <Tooltip label="Настройки приложения">
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenSettings}
              aria-label="Настройки приложения"
            >
              <IconSettings />
            </button>
          </Tooltip>
        )}
        <ThemeMenu theme={theme} onChange={onThemeChange} />
      </div>
      <LockNotice />
      {loading ? (
        <div className="screen-state">
          <div>
            <div className="screen-state-title">Загружаем сетлист…</div>
            <div className="screen-state-text">Секунду, подтягиваем песни из базы.</div>
          </div>
        </div>
      ) : error ? (
        <div className="screen-state">
          <div>
            <div className="screen-state-title">Не удалось загрузить сетлист</div>
            <div className="screen-state-text">{error}</div>
            {onRetry && (
              <button className="action-btn" onClick={onRetry} type="button">
                Повторить
              </button>
            )}
          </div>
        </div>
      ) : songs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Пока нет песен</div>
          <div>Нажмите «+», чтобы создать первую песню с аккордами и текстом.</div>
        </div>
      ) : (
        <div className="song-list" ref={listRef}>
          {songs.map((song) => {
            const isDragging = draggingId === song.id
            const isDropBefore = dropIndicator && dropIndicator.id === song.id && dropIndicator.position === 'before'
            const isDropAfter = dropIndicator && dropIndicator.id === song.id && dropIndicator.position === 'after'

            const cardClassNames = [
              'song-card',
              isDragging ? 'is-dragging' : null,
              isDropBefore ? 'drop-before' : null,
              isDropAfter ? 'drop-after' : null,
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={song.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(song.id, el)
                  else cardRefs.current.delete(song.id)
                }}
                data-song-id={song.id}
                className={cardClassNames}
                onClick={(event) => handleCardClick(song.id, event)}
              >
                <button
                  type="button"
                  className="song-card-handle"
                  aria-label="Перетащить песню"
                  disabled={!isInteractive}
                  onPointerDown={(event) => handleHandlePointerDown(event, song.id)}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerCancel}
                >
                  <IconGrip />
                </button>
                <div className="song-card-main">
                  <div className="song-card-title">
                    {song.title || 'Без названия'}
                    {remoteChanges?.[song.id] && (
                      <span className="song-card-changed" title={`Изменили — ${remoteChanges[song.id]}`}>
                        изменено
                      </span>
                    )}
                  </div>
                  <SongMeta song={song} />
                </div>
                <Tooltip label="Удалить песню">
                  <button
                    className="song-card-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteId(song.id)
                    }}
                    aria-label="Удалить песню"
                  >
                    <IconTrash />
                  </button>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}

      <Tooltip label="Новая песня">
        <button className="fab" onClick={onCreate} aria-label="Новая песня" disabled={creating || loading}>
          <IconPlus />
        </button>
      </Tooltip>

      {confirmDeleteId && (
        <ConfirmModal
          title="Удалить песню?"
          text="Песню можно будет восстановить в течение нескольких секунд после удаления."
          confirmLabel="Удалить"
          onConfirm={() => {
            const id = confirmDeleteId
            setConfirmDeleteId(null)
            onDelete(id)
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}

      {pendingDelete && (
        <UndoBanner
          message={`«${pendingDelete.song.title || 'Без названия'}» удалена`}
          expiresAt={pendingDelete.expiresAt}
          onUndo={onUndoDelete}
        />
      )}
    </div>
  )
}
