import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import SongList from './components/SongList.jsx'
import SongEditor from './components/SongEditor.jsx'
import { loadTheme, saveTheme, loadViewMode, saveViewMode } from './lib/storage.js'
import { applyTheme } from './lib/theme.js'
import {
  ApiError,
  createSong as apiCreateSong,
  deleteSong as apiDeleteSong,
  getSong as apiGetSong,
  listSongs as apiListSongs,
  reorderSongs as apiReorderSongs,
  toSummary as apiToSummary,
  updateSong as apiUpdateSong,
} from './lib/api.js'

export default function App() {
  const [songs, setSongs] = useState([])
  const [songsLoading, setSongsLoading] = useState(true)
  const [songsError, setSongsError] = useState(null)
  const [theme, setTheme] = useState(loadTheme)
  const [viewMode, setViewMode] = useState(loadViewMode)

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    saveViewMode(viewMode)
  }, [viewMode])

  const fetchSongs = useCallback(async () => {
    setSongsLoading(true)
    try {
      const data = await apiListSongs()
      setSongs(sortSongs(data))
      setSongsError(null)
    } catch (err) {
      console.error(err)
      setSongsError(err instanceof Error ? err.message : 'Не удалось загрузить песни')
    } finally {
      setSongsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSongs()
  }, [fetchSongs])

  const handleSongMetadataChange = useCallback((detail) => {
    if (!detail) return
    const summary = apiToSummary(detail)
    if (!summary) return
    setSongs((prev) => sortSongs([...prev.filter((s) => s.id !== summary.id), summary]))
  }, [])

  const handleCreate = useCallback(async () => {
    const created = await apiCreateSong()
    handleSongMetadataChange(created)
    return created.id
  }, [handleSongMetadataChange])

  const handleDelete = useCallback(async (id) => {
    await apiDeleteSong(id)
    setSongs((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleReorderSong = useCallback(
    async (id, nextIndex) => {
      let orderPayload = null
      setSongs((prev) => {
        const next = reorderList(prev, id, nextIndex)
        if (!next) return prev
        orderPayload = next.map((song) => song.id)
        return next
      })
      if (!orderPayload) return
      try {
        await apiReorderSongs(orderPayload)
      } catch (err) {
        console.error(err)
        fetchSongs()
      }
    },
    [fetchSongs],
  )

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/songs" replace />} />
      <Route
        path="/songs"
        element={
          <SongListRoute
            songs={songs}
            loading={songsLoading}
            error={songsError}
            onReload={fetchSongs}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onReorder={handleReorderSong}
            theme={theme}
            onThemeChange={setTheme}
          />
        }
      />
      <Route
        path="/songs/:songId"
        element={
          <SongEditorRoute
            onSongMetadataChange={handleSongMetadataChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            theme={theme}
            onThemeChange={setTheme}
          />
        }
      />
      <Route path="*" element={<Navigate to="/songs" replace />} />
    </Routes>
  )
}

function SongListRoute({ songs, loading, error, onReload, onCreate, onDelete, onReorder, theme, onThemeChange }) {
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
      onReorder={onReorder}
      theme={theme}
      onThemeChange={onThemeChange}
    />
  )
}

function SongEditorRoute({ onSongMetadataChange, viewMode, onViewModeChange, theme, onThemeChange }) {
  const { songId } = useParams()
  const navigate = useNavigate()
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const pendingPatchRef = useRef(null)
  const pendingSongIdRef = useRef(null)
  const saveTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const songRef = useRef(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    songRef.current = song
  }, [song])

  const flushPendingPatch = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const payload = pendingPatchRef.current
    const targetSongId = pendingSongIdRef.current
    if (!payload || !targetSongId) {
      return
    }
    pendingPatchRef.current = null
    pendingSongIdRef.current = null
    const shouldUpdateUi = mountedRef.current && targetSongId === songId
    if (shouldUpdateUi) {
      setSaveError(null)
    }
    try {
      const updated = await apiUpdateSong(targetSongId, payload)
      onSongMetadataChange?.(updated)
      if (shouldUpdateUi) {
        setSong((prev) => (prev ? mergeSongState(prev, stripLines(updated)) : prev))
      }
    } catch (err) {
      console.error(err)
      pendingPatchRef.current = mergePatch(payload, pendingPatchRef.current)
      pendingSongIdRef.current = targetSongId
      if (shouldUpdateUi) {
        setSaveError('Не удалось сохранить изменения')
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null
          flushPendingPatch()
        }, 1500)
      }
    }
  }, [songId, onSongMetadataChange])

  useEffect(() => {
    let ignore = false
    async function loadSong() {
      setLoading(true)
      setError(null)
      await flushPendingPatch()
      pendingPatchRef.current = null
      pendingSongIdRef.current = null
      try {
        const data = await apiGetSong(songId)
        if (ignore) return
        setSong(data)
        songRef.current = data
        onSongMetadataChange?.(data)
      } catch (err) {
        if (ignore) return
        if (err instanceof ApiError && err.status === 404) {
          navigate('/songs', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Не удалось загрузить песню')
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }
    loadSong()
    return () => {
      ignore = true
    }
  }, [songId, flushPendingPatch, navigate, onSongMetadataChange])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (pendingPatchRef.current) {
        void flushPendingPatch()
      }
    }
  }, [flushPendingPatch])

  const handleSongPatch = useCallback(
    (patch) => {
      if (!songRef.current) return
      let patchToApply = patch
      const currentSong = songRef.current
      const shouldAutoSetOriginalKey =
        Object.prototype.hasOwnProperty.call(patch, 'key') &&
        patch.originalKey === undefined &&
        shouldSeedOriginalKey(currentSong) &&
        typeof patch.key === 'string' &&
        patch.key.trim().length > 0
      if (shouldAutoSetOriginalKey) {
        patchToApply = { ...patch, originalKey: patch.key }
      }
      const timestamp = new Date().toISOString()
      const applied = { ...patchToApply, updatedAt: timestamp }
      setSong((prev) => mergeSongState(prev, applied))
      songRef.current = mergeSongState(songRef.current, applied)
      pendingPatchRef.current = mergePatch(pendingPatchRef.current, patchToApply)
      pendingSongIdRef.current = songRef.current?.id || songId
      setSaveError(null)
      if (!saveTimerRef.current) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null
          flushPendingPatch()
        }, 400)
      }
    },
    [flushPendingPatch, songId],
  )

  if (loading) {
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

  if (error) {
    return (
      <div className="app">
        <div className="screen-state">
          <div>
            <div className="screen-state-title">Не удалось загрузить песню</div>
            <div className="screen-state-text">{error}</div>
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
      />
      {saveError && (
        <div className="save-banner" role="status">
          <span>{saveError}</span>
          <button type="button" onClick={() => flushPendingPatch()}>
            Повторить
          </button>
        </div>
      )}
    </>
  )
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
  if (!hasOriginalKeyValue(song)) return true
  return song.originalKey === 'C' && song.key === 'C' && isPristineSong(song)
}

function sortSongs(list) {
  return [...list].sort((a, b) => {
    const posDiff = (a.position ?? 0) - (b.position ?? 0)
    if (posDiff !== 0) return posDiff
    const aTime = new Date(a.createdAt ?? 0).valueOf()
    const bTime = new Date(b.createdAt ?? 0).valueOf()
    return aTime - bTime
  })
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

function mergeSongState(song, patch) {
  if (!song) return song
  const next = { ...song, ...patch }
  if (!Object.prototype.hasOwnProperty.call(patch, 'lines')) {
    next.lines = song.lines
  }
  return next
}

function mergePatch(existing, patch) {
  if (!patch) {
    return existing ? { ...existing } : null
  }
  if (!existing) {
    return { ...patch }
  }
  const next = { ...existing, ...patch }
  if (!Object.prototype.hasOwnProperty.call(patch, 'lines')) {
    next.lines = existing.lines
  }
  return next
}

function stripLines(detail) {
  if (!detail) return detail
  const { lines, ...rest } = detail
  return rest
}
