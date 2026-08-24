// LocalStorage persistence for theme and view-mode, plus reusable helpers.

// Re-exported so settings UI has one place to import preferences from; the
// values themselves belong to the identity module, which the API layer uses.
export { getDisplayName, setDisplayName } from "./identity.js";

const THEME_KEY = "chords_app_theme_v1";
const VIEW_MODE_KEY = "chords_app_view_mode_v1";
const TEXT_SCALE_KEY = "chords_app_text_scale_v1";
const COLOR_SCHEME_KEY = "chords_app_color_scheme_v1";
const CHORD_STYLE_KEY = "chords_app_chord_style_v1";
const SHOW_COMMENTS_KEY = "chords_app_show_comments_v1";
const LOCAL_SONG_PREFIX = "chords_app_local_song_";
const CUSTOM_SHAPES_KEY = "chords_app_custom_shapes_v1";

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function emptyLine() {
  return { id: uid(), type: "line", lyrics: "", chords: [] };
}

export function sectionLine(label = "", key = null) {
  return { id: uid(), type: "section", label, key, chords: [] };
}

// Purely-instrumental line (intro, coda, break…) — chords only, no lyrics,
// chords are ordered sequentially rather than tied to character position.
export function instrumentalLine() {
  return { id: uid(), type: "chords", chords: [] };
}

// A performer's note left inside the song ("попробовать здесь другой
// аккорд"). The text lives in `lyrics` like every other textual line, so the
// places that fall back to it — the conflict diff, an older client — still
// show the words instead of an empty row.
export function commentLine(text = "") {
  return { id: uid(), type: "comment", lyrics: text, chords: [] };
}

// Explicit page break — forces the following content onto a new PDF page.
export function pagebreakLine() {
  return { id: uid(), type: "pagebreak", chords: [] };
}

export function loadTheme() {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function loadViewMode() {
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === "chords" || v === "lyrics" || v === "both" ? v : "both";
}

export function saveViewMode(mode) {
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

// Whether comments are shown. Deliberately one global switch rather than a
// per-song field: wanting to see the notes is a mood ("сейчас я разбираю
// гармонию"), not a property of one song. Local, like theme and view mode —
// which also means it works while the app is locked, where a song field
// could not be touched at all.
export function loadShowComments() {
  return localStorage.getItem(SHOW_COMMENTS_KEY) !== "0";
}

export function saveShowComments(value) {
  localStorage.setItem(SHOW_COMMENTS_KEY, value ? "1" : "0");
}

export function loadTextScale() {
  const raw = localStorage.getItem(TEXT_SCALE_KEY);
  const parsed = raw == null ? NaN : Number(raw);
  if (Number.isFinite(parsed)) {
    const clamped = Math.min(Math.max(parsed, 0.85), 1.4);
    return clamped;
  }
  return 1;
}

export function saveTextScale(scale) {
  localStorage.setItem(TEXT_SCALE_KEY, String(scale));
}

// How chords are rendered across the app:
//   "chip"  — the default accent-tinted pill,
//   "color" — one colour per root note (see --chord-color-0..11),
//   "plain" — monospace text with no highlighting at all, as in the PDF.
export const CHORD_STYLES = ["chip", "color", "plain"];

export function loadChordStyle() {
  const v = localStorage.getItem(CHORD_STYLE_KEY);
  if (CHORD_STYLES.includes(v)) return v;
  // Before the third style existed the preference was a colour on/off flag;
  // carry it over so an upgrade does not silently reset the choice.
  return localStorage.getItem(COLOR_SCHEME_KEY) === "on" ? "color" : "chip";
}

export function saveChordStyle(style) {
  const next = CHORD_STYLES.includes(style) ? style : "chip";
  localStorage.setItem(CHORD_STYLE_KEY, next);
  // Kept in step for a tab still running the previous build.
  localStorage.setItem(COLOR_SCHEME_KEY, next === "color" ? "on" : "off");
}

// Per-song local transposition override. While active, the editor shows and
// edits a local copy of { key, lines } instead of the server song. The copy
// is flushed to the server only when the user explicitly sets a new original
// tonality. Lets the user try transpositions without touching the server.
export function loadLocalSongOverride(songId) {
  if (!songId) return null;
  try {
    const raw = localStorage.getItem(LOCAL_SONG_PREFIX + songId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.key === "string" &&
      Array.isArray(parsed.lines)
    ) {
      return { key: parsed.key, lines: parsed.lines };
    }
  } catch {
    // ignore malformed entry
  }
  return null;
}

export function saveLocalSongOverride(songId, override) {
  if (!songId || !override) return;
  localStorage.setItem(LOCAL_SONG_PREFIX + songId, JSON.stringify(override));
}

export function clearLocalSongOverride(songId) {
  if (!songId) return;
  localStorage.removeItem(LOCAL_SONG_PREFIX + songId);
}

// User-authored fingerings, keyed by exact chord symbol (e.g. "Bm", "Cadd9").
// Built up by hand-placing a shape in the fretboard editor — separate from
// the curated library (which is fixed, built-in) so a personal shape shows
// up as its own card and can be removed again.
function loadAllCustomShapes() {
  try {
    const raw = localStorage.getItem(CUSTOM_SHAPES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCustomShapes(chordText) {
  const all = loadAllCustomShapes();
  return Array.isArray(all[chordText]) ? all[chordText] : [];
}

export function addCustomShape(chordText, code) {
  if (!chordText || !code) return;
  const all = loadAllCustomShapes();
  const list = Array.isArray(all[chordText]) ? all[chordText] : [];
  if (!list.includes(code)) {
    all[chordText] = [...list, code];
    localStorage.setItem(CUSTOM_SHAPES_KEY, JSON.stringify(all));
  }
}

export function removeCustomShape(chordText, code) {
  if (!chordText || !code) return;
  const all = loadAllCustomShapes();
  const list = Array.isArray(all[chordText]) ? all[chordText] : [];
  all[chordText] = list.filter((c) => c !== code);
  localStorage.setItem(CUSTOM_SHAPES_KEY, JSON.stringify(all));
}
