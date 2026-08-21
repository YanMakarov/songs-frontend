import { useMemo } from 'react'

// Shown only when a merge genuinely could not be made: the same lines were
// edited from both sides. Everything else the server combines silently, so
// reaching this dialog should be rare — which is why it can afford to be
// explicit rather than clever.

function lyricsOf(song) {
  if (!song || !Array.isArray(song.lines)) return []
  return song.lines.map((line) => {
    if (line.type === 'section') return `## ${line.label || ''}`.trim()
    if (line.type === 'pagebreak') return '---'
    if (line.type === 'chords') return line.chords.map((c) => c.chord).join(' ')
    return line.lyrics || ''
  })
}

/** Mark lines that differ, aligned by position — enough to see what moved. */
function diff(mine, theirs) {
  const length = Math.max(mine.length, theirs.length)
  const rows = []
  for (let i = 0; i < length; i += 1) {
    const a = mine[i] ?? null
    const b = theirs[i] ?? null
    rows.push({ index: i, mine: a, theirs: b, changed: a !== b })
  }
  return rows
}

export default function ConflictModal({ mine, theirs, onKeepMine, onTakeTheirs, onClose }) {
  const rows = useMemo(() => diff(lyricsOf(mine), lyricsOf(theirs)), [mine, theirs])
  const changedCount = rows.filter((r) => r.changed).length
  const author = theirs?.updatedBy || 'кто-то'

  return (
    <div
      className="settings-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-modal-title" id="conflict-title">
            Те же строки правили дважды
          </div>
        </div>

        {/* Plural "изменили" on purpose — a display name says nothing about
            how to address its owner, and the neutral form is never wrong. */}
        <p className="conflict-lead">
          {`${author} — изменили те же строки, что и вы. Остальное объединилось само, выбрать нужно только здесь.`}
        </p>

        <div className="conflict-columns">
          <div className="conflict-column">
            <div className="conflict-column-head">Ваша версия</div>
            {rows.map((row) => (
              <div key={`mine-${row.index}`} className={'conflict-line' + (row.changed ? ' is-changed' : '')}>
                {row.mine ?? <span className="conflict-empty">—</span>}
              </div>
            ))}
          </div>
          <div className="conflict-column">
            <div className="conflict-column-head">Версия в группе</div>
            {rows.map((row) => (
              <div key={`theirs-${row.index}`} className={'conflict-line' + (row.changed ? ' is-changed' : '')}>
                {row.theirs ?? <span className="conflict-empty">—</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="conflict-actions">
          <span className="conflict-count">
            {changedCount === 1 ? 'Различается 1 строка' : `Различается строк: ${changedCount}`}
          </span>
          <button type="button" className="ghost-btn" onClick={onTakeTheirs}>
            Взять версию группы
          </button>
          <button type="button" className="accent-btn" onClick={onKeepMine}>
            Оставить мою
          </button>
        </div>
      </div>
    </div>
  )
}
