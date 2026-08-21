// One place for cache keys, so an invalidation in the sync layer (phase 3)
// cannot drift from the key a query actually registered under.

export const queryKeys = {
  setlist: () => ['setlist'],
  songs: () => ['songs'],
  song: (songId) => ['song', songId],
  deletedSongs: () => ['songs', 'deleted'],
  movableShapes: () => ['movable-shapes'],
  //: Cursor into the setlist change feed. Persisted with the rest of the
  //: cache so a reload resumes where it left off instead of re-syncing.
  syncRev: () => ['sync', 'rev'],
}
