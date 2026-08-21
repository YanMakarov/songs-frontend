// Which songs someone else has touched since the user last opened them.
//
// Kept in the query cache rather than component state so it survives
// navigation between the list and an editor, and so the sync layer — which
// runs outside React — can write to it.

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from './queryKeys.js'

export function useRemoteChanges() {
  const { data } = useQuery({
    queryKey: queryKeys.remoteChanges(),
    // Never fetched: the sync layer is the only writer. `initialData` keeps
    // the query from sitting in a pending state forever.
    queryFn: () => ({}),
    initialData: {},
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data || {}
}
