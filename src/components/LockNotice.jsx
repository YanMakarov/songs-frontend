import { useLock } from '../lib/useLock.js'

// The lock is on by default, so somebody opening the app for the first time
// meets a screen where the edit controls are simply absent. Without a line of
// explanation that reads as a broken app rather than a deliberate mode.

export default function LockNotice() {
  const locked = useLock()
  if (!locked) return null
  return (
    <div className="lock-notice" role="status">
      Только просмотр · удерживайте замок, чтобы разрешить правки
    </div>
  )
}
