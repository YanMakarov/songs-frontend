import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash } from './Icons.jsx'
import ThemeMenu from './ThemeMenu.jsx'
import Tooltip from './Tooltip.jsx'

function formatMeta(song) {
  const parts = [song.key]
  if (song.bpm) parts.push(`${song.bpm} BPM`)
  if (song.timeSignature) parts.push(song.timeSignature)
  return parts.filter(Boolean).join(' · ')
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
  onReorder,
  setlist,
  onSetlistRename,
  theme,
  onThemeChange,
}) {
  const [draggingId, setDraggingId] = useState(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef(null)
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

  function handleDragStart(event, songId) {
    if (!isInteractive) return
    setDraggingId(songId)
    setDropIndicator(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', songId)
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

  function handleDragOver(event, songId) {
    if (!isInteractive) return
    if (!draggingId || draggingId === songId) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const isBefore = event.clientY - rect.top < rect.height / 2
    const position = isBefore ? 'before' : 'after'
    setDropIndicator((prev) => {
      if (prev && prev.id === songId && prev.position === position) {
        return prev
      }
      return { id: songId, position }
    })
  }

  function handleDrop(event, songId) {
    if (!isInteractive) return
    event.preventDefault()
    if (!draggingId) return

    const indicator =
      dropIndicator && dropIndicator.id === songId ? dropIndicator : { id: songId, position: 'before' }

    const destinationIndex = getDestinationIndex(indicator.id, indicator.position)
    if (destinationIndex == null) {
      handleDragEnd()
      return
    }

    onReorder?.(draggingId, destinationIndex)
    handleDragEnd()
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropIndicator(null)
  }

  function handleListDragOver(event) {
    if (!isInteractive) return
    if (!draggingId || songs.length === 0) return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    const lastSong = songs[songs.length - 1]
    setDropIndicator({ id: lastSong.id, position: 'after' })
  }

  function handleListDrop(event) {
    if (!isInteractive) return
    if (!draggingId || songs.length === 0) return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    const lastSong = songs[songs.length - 1]
    const destinationIndex = getDestinationIndex(lastSong.id, 'after')
    if (destinationIndex != null) {
      onReorder?.(draggingId, destinationIndex)
    }
    handleDragEnd()
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
        <ThemeMenu theme={theme} onChange={onThemeChange} />
      </div>
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
        <div className="song-list" onDragOver={handleListDragOver} onDrop={handleListDrop}>
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
                className={cardClassNames}
                draggable={isInteractive}
                onDragStart={(event) => handleDragStart(event, song.id)}
                onDragOver={(event) => handleDragOver(event, song.id)}
                onDrop={(event) => handleDrop(event, song.id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (!draggingId) {
                    onOpen(song.id)
                  }
                }}
              >
                <div className="song-card-main">
                  <div className="song-card-title">{song.title || 'Без названия'}</div>
                  <div className="song-card-meta">{formatMeta(song)}</div>
                </div>
                <Tooltip label="Удалить песню">
                  <button
                    className="song-card-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(song.id)
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
    </div>
  )
}
