import { useSyncExternalStore } from 'react'
import { getRemoteChanges, subscribeRemoteChanges } from './remoteChanges.js'

/** Songs another member changed since this browser last opened them. */
export function useRemoteChanges() {
  return useSyncExternalStore(subscribeRemoteChanges, getRemoteChanges, getRemoteChanges)
}
