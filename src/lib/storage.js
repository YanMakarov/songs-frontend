// LocalStorage persistence for theme and view-mode, plus reusable helpers.

const THEME_KEY = 'chords_app_theme_v1'
const VIEW_MODE_KEY = 'chords_app_view_mode_v1'
const TEXT_SCALE_KEY = 'chords_app_text_scale_v1'

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function emptyLine() {
  return { id: uid(), type: 'line', lyrics: '', chords: [] }
}

export function sectionLine(label = '', key = null) {
  return { id: uid(), type: 'section', label, key, chords: [] }
}

// Purely-instrumental line (intro, coda, break…) — chords only, no lyrics,
// chords are ordered sequentially rather than tied to character position.
export function instrumentalLine() {
  return { id: uid(), type: 'chords', chords: [] }
}

export function loadTheme() {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadViewMode() {
  const v = localStorage.getItem(VIEW_MODE_KEY)
  return v === 'chords' || v === 'lyrics' || v === 'both' ? v : 'both'
}

export function saveViewMode(mode) {
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

export function loadTextScale() {
  const raw = localStorage.getItem(TEXT_SCALE_KEY)
  const parsed = raw == null ? NaN : Number(raw)
  if (Number.isFinite(parsed)) {
    const clamped = Math.min(Math.max(parsed, 0.85), 1.4)
    return clamped
  }
  return 1
}

export function saveTextScale(scale) {
  localStorage.setItem(TEXT_SCALE_KEY, String(scale))
}
