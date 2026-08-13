import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconClose, IconDownload, IconPlus } from './Icons.jsx'
import { chordSequence } from '../lib/repeats.js'
import { emptyLine } from '../lib/storage.js'

const PDF_LYRICS_FONT_SIZE = 15
const PDF_CHORD_FONT_SIZE = 13
const PDF_SECTION_SIZE = 13

// Print preparation view: a single continuous printable sheet (header +
// text + chords + section labels). There is no on-screen pagination — the
// real PDF is produced by the browser's print dialog, which paginates the
// sheet exactly as it will appear. Hovering any line reveals controls to
// insert an empty line below it (or remove an existing empty line) to tune
// spacing before printing.
export default function PrintPreview({ song, viewMode, appliedTextScale, onChange, onClose, onDownload }) {
  const measureRef = useRef(null)
  const [charWidth, setCharWidth] = useState(7.2)
  const scale = Number.isFinite(appliedTextScale) ? appliedTextScale : 1

  const items = useMemo(() => buildPrintableItems(song, viewMode), [song, viewMode])

  useLayoutEffect(() => {
    function measure() {
      if (!measureRef.current) return
      const w = measureRef.current.getBoundingClientRect().width / 40
      if (w > 0) setCharWidth(w)
    }
    measure()
    let pending = true
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (pending) measure()
      })
    }
    return () => {
      pending = false
    }
  }, [scale])

  function addEmptyLineAfter(lineId) {
    const idx = song.lines.findIndex((l) => l.id === lineId)
    if (idx === -1) return
    const next = [...song.lines]
    next.splice(idx + 1, 0, emptyLine())
    onChange({ lines: next })
  }

  function deleteLine(lineId) {
    onChange({ lines: song.lines.filter((l) => l.id !== lineId) })
  }

  function isEmptyLine(line) {
    return line.type === 'line' && !line.lyrics && (!line.chords || line.chords.length === 0)
  }

  const scaleVars = {
    '--pdf-scale': scale,
    '--pdf-lyrics-size': `${PDF_LYRICS_FONT_SIZE * scale}px`,
    '--pdf-chord-size': `${PDF_CHORD_FONT_SIZE * scale}px`,
    '--pdf-section-size': `${PDF_SECTION_SIZE * scale}px`,
    '--pdf-char-width': `${charWidth}px`,
  }

  const meta = metaText(song)

  return (
    <div className="print-preview" data-view-mode={viewMode} style={scaleVars}>
      <div className="print-preview-toolbar no-print">
        <button type="button" className="ghost-btn" onClick={onClose}>
          <IconClose /> Закрыть
        </button>
        <div className="print-preview-title">
          Подготовка к печати · {song.title || 'Без названия'}
        </div>
        <button type="button" className="accent-btn" onClick={onDownload}>
          <IconDownload /> Скачать PDF
        </button>
      </div>

      <div className="print-preview-hint no-print">
        Наведите на строку, чтобы добавить под ней пустую, или удалить пустую строку
      </div>

      <span
        ref={measureRef}
        className="pdf-measure-char"
        style={{ fontSize: PDF_LYRICS_FONT_SIZE * scale }}
        aria-hidden="true"
      >
        {'M'.repeat(40)}
      </span>

      <div className="print-preview-scroll">
        <section className="pdf-sheet">
          <header className="pdf-header">
            <span className="pdf-title">{song.title || 'Без названия'}</span>
            {meta && <span className="pdf-meta">{meta}</span>}
          </header>
          <div className="pdf-body">
            {items.length === 0 ? (
              <div className="pdf-empty">Нет строк</div>
            ) : (
              items.map((it) => (
                <PrintLineContent
                  key={it.line.id}
                  item={it}
                  charWidth={charWidth}
                  onAddAfter={() => addEmptyLineAfter(it.line.id)}
                  onDelete={isEmptyLine(it.line) ? () => deleteLine(it.line.id) : null}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function metaText(song) {
  const parts = []
  if (song.key) parts.push(song.key)
  if (song.bpm) parts.push(`${song.bpm} BPM`)
  if (song.timeSignature) parts.push(song.timeSignature)
  return parts.join('  ·  ')
}

function PrintLineContent({ item, charWidth, onAddAfter, onDelete }) {
  const { line, kind } = item
  return (
    <div className="pdf-item">
      <PrintLineBody line={line} kind={kind} charWidth={charWidth} />
      <div className="pdf-item-controls no-print">
        <button
          type="button"
          className="pdf-item-btn"
          onClick={onAddAfter}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Добавить пустую строку"
          title="Добавить пустую строку"
        >
          <IconPlus />
        </button>
        {onDelete && (
          <button
            type="button"
            className="pdf-item-btn"
            onClick={onDelete}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Удалить пустую строку"
            title="Удалить пустую строку"
          >
            <IconClose />
          </button>
        )}
      </div>
    </div>
  )
}

function PrintLineBody({ line, kind, charWidth }) {
  if (kind === 'section') {
    return (
      <div className="pdf-section">
        <span className="pdf-section-label">{line.label || 'Раздел'}</span>
        {line.key && <span className="pdf-section-key">{line.key}</span>}
      </div>
    )
  }
  if (kind === 'chordsOnly') {
    const seq = chordSequence(line)
    return (
      <div className="pdf-chords-only">
        {seq.length === 0 ? (
          <span className="pdf-empty">Проигрыш</span>
        ) : (
          seq.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="sep">|</span>}
              <span className="chord-token">{c}</span>
            </span>
          ))
        )}
      </div>
    )
  }
  if (kind === 'instrumental') {
    const chords = [...line.chords].sort((a, b) => a.position - b.position).map((c) => c.chord)
    return (
      <div className="pdf-chords-only">
        {chords.length === 0 ? (
          <span className="pdf-empty">Проигрыш</span>
        ) : (
          chords.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="sep">|</span>}
              <span className="chord-token">{c}</span>
            </span>
          ))
        )}
      </div>
    )
  }
  const sortedChords = [...line.chords].sort((a, b) => a.position - b.position)
  const lyricsText = line.lyrics || ''
  return (
    <div className="pdf-line">
      {sortedChords.length > 0 && (
        <div className="pdf-chord-row">
          {sortedChords.map((c) => (
            <span
              key={c.id}
              className="pdf-chord"
              style={{ left: `${c.position * charWidth}px` }}
            >
              {c.chord}
            </span>
          ))}
        </div>
      )}
      <div className="pdf-lyrics">{lyricsText || '\u00A0'}</div>
    </div>
  )
}

function buildPrintableItems(song, viewMode) {
  const items = []
  song.lines.forEach((line) => {
    if (line.type === 'pagebreak') return
    if (viewMode === 'chords') {
      if (line.type !== 'section' && !(line.chords && line.chords.length > 0)) return
    } else if (viewMode === 'lyrics') {
      if (line.type === 'chords') return
    }
    items.push({ line, kind: nodeKind(line, viewMode) })
  })
  return items
}

function nodeKind(line, viewMode) {
  if (line.type === 'section') return 'section'
  if (viewMode === 'chords') return 'chordsOnly'
  if (line.type === 'chords') return 'instrumental'
  return 'line'
}
