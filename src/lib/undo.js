// How long an optimistic deletion stays undoable before being committed.
// Shared by song-deletion (list) and line-deletion (editor) flows.
export const UNDO_TIMEOUT_MS = 3000