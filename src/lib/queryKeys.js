// One place for cache keys, so an invalidation in the sync layer (phase 3)
// cannot drift from the key a query actually registered under.

export const queryKeys = {
  setlist: () => ['setlist'],
  songs: () => ['songs'],
  song: (songId) => ['song', songId],
  deletedSongs: () => ['songs', 'deleted'],
  movableShapes: () => ['movable-shapes'],
}
