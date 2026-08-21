import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import SongList from './components/SongList.jsx'
import SongEditor from './components/SongEditor.jsx'
import ChordLibraryPage from './components/ChordLibraryPage.jsx'
import { loadTheme, saveTheme, loadViewMode, saveViewMode, loadTextScale, saveTextScale, loadColorScheme, saveColorScheme } from './lib/storage.js'
import { applyTheme } from './lib/theme.js'
import AppSettingsModal from './components/AppSettingsModal.jsx'
import ConflictModal from './components/ConflictModal.jsx'
import NamePrompt from './components/NamePrompt.jsx'
import { useAuth } from './lib/auth.jsx'
import { UNDO_TIMEOUT_MS } from './lib/undo.js'
import { discard, flush, getStatus, hasPending, retry, subscribeConflict, subscribeStatus } from './lib/writeQueue.js'
import { patchSong } from './lib/cacheBridge.js'
import { queryKeys } from './lib/queryKeys.js'
import { useSetlistQuery, useSongQuery, useSongsQuery } from './lib/queries.js'
import { useSetlistSync } from './lib/sync.js'
import { clearRemoteChange } from './lib/remoteChanges.js'
import { useRemoteChanges } from './lib/useRemoteChanges.js'
import {
  useCreateSongMutation,
  useDeleteSongMutation,
  useReorderSongsMutation,
  useUpdateSetlistMutation,
} from './lib/mutations.js'

export default function App() {
  // Keeps this tab in step with the rest of the group. One cheap GET on focus
  // and on a timer while visible; nothing at all while hidden.
  useSetlistSync()

  const { user } = useAuth()

  const { data: songs = [], isPending: songsPending, error: songsError, refetch: refetchSongs } = useSongsQuery()
  const remoteChanges = useRemoteChanges()
  const { data: setlist } = useSetlistQuery()
  const [pendingDelete, setPendingDelete] = useState(null)
  const [theme, setTheme] = useState(loadTheme)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [textScale, setTextScale] = useState(loadTextScale)
  const [colorScheme, setColorScheme] = useState(loadColorScheme)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pendingDeleteRef = useRef(null)

  const createSong = useCreateSongMutation()
  const deleteSong = useDeleteSongMutation()
  const reorderSongs = useReorderSongsMutation()
  const renameSetlist = useUpdateSetlistMutation()

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    saveViewMode(viewMode)
  }, [viewMode])

  useEffect(() => {
    saveTextScale(textScale)
    document.documentElement.style.setProperty('--song-scale', String(Number.isFinite(textScale) ? textScale : 1))
  }, [textScale])

  useEffect(() => {
    saveColorScheme(colorScheme)
    document.documentElement.setAttribute('data-color-scheme', colorScheme ? 'on' : 'off')
  }, [colorScheme])

  const handleCreate = useCallback(async () => {
    // Create song without default key - let user set it or detect from chords
    const created = await createSong.mutateAsync({ key: '', originalKey: '' })
    return created.id
  }, [createSong])

  // Deletion is deferred so the undo banner has something to cancel. Phase 6
  // replaces this with an immediate soft delete plus a restore, which is both
  // simpler and survives a reload — the server already supports it.
  const handleDelete = useCallback(
    (id) => {
      const song = songs.find((s) => s.id === id)
      if (!song) return
      const previous = pendingDeleteRef.current
      if (previous) {
        // Never drop a pending deletion silently: it is already hidden from
        // the list, so not committing it would leave the interface and the
        // database disagreeing.
        clearTimeout(previous.timer)
        deleteSong.mutate({ songId: previous.id, rev: previous.song.rev })
      }
      const expiresAt = Date.now() + UNDO_TIMEOUT_MS
      const timer = setTimeout(() => {
        pendingDeleteRef.current = null
        setPendingDelete(null)
        deleteSong.mutate({ songId: id, rev: song.rev })
      }, UNDO_TIMEOUT_MS)
      const entry = { id, song, expiresAt, timer }
      pendingDeleteRef.current = entry
      setPendingDelete({ id, song, expiresAt })
    },
    [songs, deleteSong],
  )

  const handleUndoDelete = useCallback(() => {
    const pending = pendingDeleteRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingDeleteRef.current = null
    setPendingDelete(null)
  }, [])

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current
      if (pending) {
        clearTimeout(pending.timer)
        pendingDeleteRef.current = null
      }
    }
  }, [])

  const handleReorderSong = useCallback(
    (id, nextIndex) => {
      const next = reorderList(songs, id, nextIndex)
      if (!next) return
      reorderSongs.mutate(next.map((song) => song.id))
    },
    [songs, reorderSongs],
  )

  const handleSetlistRename = useCallback(
    (name) => {
      const trimmed = (name || '').trim()
      if (!trimmed) return
      renameSetlist.mutate({ name: trimmed })
    },
    [renameSetlist],
  )

  // A song awaiting its undo window is hidden rather than removed from the
  // cache, so cancelling costs nothing and cannot lose the row.
  const visibleSongs = pendingDelete ? songs.filter((s) => s.id !== pendingDelete.id) : songs

  return (
    <>
      <Routes>
      <Route path="/" element={<Navigate to="/songs" replace />} />
      <Route
        path="/songs"
        element={
          <SongListRoute
            songs={visibleSongs}
            loading={songsPending && songs.length === 0}
            error={songsError ? songsError.message : null}
            onReload={refetchSongs}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onUndoDelete={handleUndoDelete}
            pendingDelete={pendingDelete}
            onReorder={handleReorderSong}
            remoteChanges={remoteChanges}
            setlist={setlist}
            onSetlistRename={handleSetlistRename}
            theme={theme}
            onThemeChange={setTheme}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
      />
      <Route
        path="/songs/:songId"
        element={
          <SongEditorRoute
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            theme={theme}
            onThemeChange={setTheme}
            textScale={textScale}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
      />
      <Route path="/chords-library" element={<ChordLibraryRoute />} />
      <Route path="*" element={<Navigate to="/songs" replace />} />
      </Routes>
      {/* Only without an account: the display name comes from the session
          now, so asking for one would collect something nothing reads. */}
      {user ? null : <NamePrompt />}
      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        textScale={textScale}
        onTextScaleChange={setTextScale}
        colorScheme={colorScheme}
        onColorSchemeChange={setColorScheme}
      />
    </>
  )
}

function SongListRoute({
  songs,
  loading,
  error,
  onReload,
  onCreate,
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
}) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  function handleOpen(id) {
    navigate(`/songs/${id}`)
  }

  async function handleCreateAndOpen() {
    if (creating) return
    setCreating(true)
    try {
      const id = await onCreate()
      if (id) navigate(`/songs/${id}`)
    } catch (err) {
      console.error(err)
      alert('Не удалось создать песню')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteSong(id) {
    try {
      await onDelete(id)
    } catch (err) {
      console.error(err)
      alert('Не удалось удалить песню')
    }
  }

  return (
    <SongList
      songs={songs}
      loading={loading}
      error={error}
      onRetry={onReload}
      onOpen={handleOpen}
      onCreate={handleCreateAndOpen}
      creating={creating}
      onDelete={handleDeleteSong}
      onUndoDelete={onUndoDelete}
      pendingDelete={pendingDelete}
      onReorder={onReorder}
      remoteChanges={remoteChanges}
      setlist={setlist}
      onSetlistRename={onSetlistRename}
      theme={theme}
      onThemeChange={onThemeChange}
      onOpenSettings={onOpenSettings}
      onOpenLibrary={() => navigate('/chords-library')}
    />
  )
}

function SongEditorRoute({
  viewMode,
  onViewModeChange,
  theme,
  onThemeChange,
  textScale,
  onOpenSettings,
}) {
  const { songId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: song, isPending, error, refetch } = useSongQuery(songId)
  const remoteChanges = useRemoteChanges()
  const [saveError, setSaveError] = useState(null)
  const [conflict, setConflict] = useState(null)
  const songRef = useRef(null)
  const remoteAuthor = remoteChanges[songId] || null

  useEffect(() => {
    songRef.current = song
  }, [song])

  // The queue lives at module scope and keeps retrying on its own, so these
  // subscriptions only reflect its state — unmounting the editor no longer
  // abandons an unsent edit.
  useEffect(() => {
    const unsubscribeStatus = subscribeStatus((id, status) => {
      if (id !== songId) return
      setSaveError(status.error)
    })
    const unsubscribeConflict = subscribeConflict((id, err) => {
      if (id !== songId) return
      // Snapshot the local version here and never read it from the cache
      // again. Background sync keeps running during the dialog, and once the
      // queue dropped this edit there is nothing stopping a refetch from
      // replacing the very version the user is being asked to choose.
      setConflict({ error: err, mine: songRef.current })
    })
    setSaveError(getStatus(songId).error)
    setConflict(null)
    return () => {
      unsubscribeStatus()
      unsubscribeConflict()
    }
  }, [songId])

  // Land whatever is queued for this song before leaving it, so reopening it
  // cannot read a version that predates the edit.
  useEffect(() => {
    return () => {
      void flush(songId)
    }
  }, [songId])

  // Someone else's edit is applied silently unless we are sitting on unsent
  // work — the sync layer skips the refetch in that case, so here the mark
  // just gets cleared once there is nothing left to warn about.
  useEffect(() => {
    if (!remoteAuthor) return
    if (hasPending(songId)) return
    clearRemoteChange(songId)
  }, [remoteAuthor, songId, queryClient, song])

  useEffect(() => {
    // ApiError carries the HTTP status; anything else is a transport failure
    // and the query layer keeps retrying it on its own.
    if (error?.status === 404) {
      navigate('/songs', { replace: true })
    }
  }, [error, navigate])

  const handleSongPatch = useCallback(
    (patch) => {
      const currentSong = songRef.current
      if (!currentSong) return
      let patchToApply = patch
      const shouldAutoSetOriginalKey =
        Object.prototype.hasOwnProperty.call(patch, 'key') &&
        patch.originalKey === undefined &&
        shouldSeedOriginalKey(currentSong) &&
        typeof patch.key === 'string' &&
        patch.key.trim().length > 0
      if (shouldAutoSetOriginalKey) {
        patchToApply = { ...patch, originalKey: patch.key }
      }
      patchSong(queryClient, songId, { ...patchToApply, updatedAt: new Date().toISOString() })
    },
    [queryClient, songId],
  )

  // Taking the server's version: drop what could not be sent, then reload.
  const handleTakeTheirs = useCallback(() => {
    discard(songId)
    setConflict(null)
    clearRemoteChange(songId)
    if (conflict?.error?.current) {
      queryClient.setQueryData(queryKeys.song(songId), conflict.error.current)
    } else {
      refetch()
    }
  }, [songId, refetch, queryClient, conflict])

  // Keeping the local version: rebase onto the server's current rev so the
  // resend is an ordinary write rather than another merge attempt — which
  // would conflict again on exactly the same lines.
  const handleKeepMine = useCallback(() => {
    const mine = conflict?.mine
    if (!mine) return
    discard(songId)
    setConflict(null)
    clearRemoteChange(songId)
    queryClient.setQueryData(queryKeys.song(songId), { ...mine, rev: conflict.error.currentRev })
    patchSong(queryClient, songId, { lines: mine.lines })
  }, [songId, queryClient, conflict])

  // With a warm cache there is nothing to wait for — this only shows on a
  // first-ever visit to a song.
  if (isPending && !song) {
    return (
      <div className="app">
        <div className="screen-state">
          <div>
            <div className="screen-state-title">Загружаем песню…</div>
            <div className="screen-state-text">Секунду, синхронизируем аккорды.</div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !song) {
    return (
      <div className="app">
        <div className="screen-state">
          <div>
            <div className="screen-state-title">Не удалось загрузить песню</div>
            <div className="screen-state-text">{error.message}</div>
            <button className="action-btn" onClick={() => navigate('/songs')}>
              К списку
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!song) {
    return <Navigate to="/songs" replace />
  }

  return (
    <>
      <SongEditor
        song={song}
        onChange={handleSongPatch}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onBack={() => navigate('/songs')}
        theme={theme}
        onThemeChange={onThemeChange}
        textScale={textScale}
        onOpenSettings={onOpenSettings}
        onOpenLibrary={(chord) => navigate(`/chords-library${chord ? `?chord=${encodeURIComponent(chord)}` : ''}`)}
      />
      {/* An overlap the server could not resolve: ask, showing both versions.
          A base too old to merge against has nothing to compare, so that case
          stays a plain banner. */}
      {conflict && conflict.error.reason === 'lines' && conflict.error.current && (
        <ConflictModal
          mine={conflict.mine}
          theirs={conflict.error.current}
          onKeepMine={handleKeepMine}
          onTakeTheirs={handleTakeTheirs}
          onClose={handleTakeTheirs}
        />
      )}
      {conflict && conflict.error.reason !== 'lines' && (
        <div className="save-banner save-banner-conflict" role="alert">
          <span>{conflict.error.message}</span>
          <button type="button" onClick={handleTakeTheirs}>
            Обновить
          </button>
        </div>
      )}
      {!conflict && remoteAuthor && hasPending(songId) && (
        <div className="save-banner save-banner-remote" role="status">
          <span>{`Песню изменили — ${remoteAuthor}`}</span>
          <button type="button" onClick={handleResolveConflict}>
            Показать
          </button>
        </div>
      )}
      {saveError && !conflict && (
        <div className="save-banner" role="status">
          <span>{saveError}</span>
          <button type="button" onClick={() => retry(songId)}>
            Повторить
          </button>
        </div>
      )}
    </>
  )
}

function ChordLibraryRoute() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  return <ChordLibraryPage initialChord={searchParams.get('chord') || null} onBack={() => navigate(-1)} />
}

function hasOriginalKeyValue(song) {
  return typeof song?.originalKey === 'string' && song.originalKey.trim().length > 0
}

function isPristineSong(song) {
  if (!song || !Array.isArray(song.lines)) return false
  if (song.lines.length !== 1) return false
  const firstLine = song.lines[0]
  if (!firstLine || firstLine.type !== 'line') return false
  const hasLyrics = typeof firstLine.lyrics === 'string' && firstLine.lyrics.trim().length > 0
  const hasChords = Array.isArray(firstLine.chords) && firstLine.chords.length > 0
  return !hasLyrics && !hasChords
}

function shouldSeedOriginalKey(song) {
  if (!song) return false
  // Don't seed original key if it's already set to something meaningful
  if (hasOriginalKeyValue(song)) return false
  // Only seed if we have a valid key and it's not empty
  if (typeof song.key === 'string' && song.key.trim().length > 0) {
    return isPristineSong(song)
  }
  return false
}

function reorderList(list, songId, nextIndex) {
  const currentIndex = list.findIndex((s) => s.id === songId)
  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= list.length || currentIndex === nextIndex) {
    return null
  }
  const next = [...list]
  const [moved] = next.splice(currentIndex, 1)
  next.splice(nextIndex, 0, moved)
  return next.map((song, index) => ({ ...song, position: index }))
}
