import { useSyncExternalStore } from 'react'
import { isLocked, subscribeLock } from './lockMode.js'

export function useLock() {
  return useSyncExternalStore(subscribeLock, isLocked, isLocked)
}
