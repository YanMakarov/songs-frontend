import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { ApiError, isOffline } from '../lib/api.js'
import { BrandMark, LoginBackdrop } from './LoginBackdrop.jsx'

// The one screen that has to work before anything else does. It is reachable
// with no session, no cache and no network, so it depends on nothing but the
// shell — which is also what lets the service worker serve it offline.

function messageFor(error) {
  if (isOffline(error)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
  }
  if (error instanceof ApiError) {
    const detail = error.payload?.detail
    if (error.status === 429) {
      const seconds = detail?.retryAfter
      return seconds
        ? `Слишком много попыток. Попробуйте через ${Math.ceil(seconds / 60)} мин.`
        : 'Слишком много попыток входа. Попробуйте позже.'
    }
    if (typeof detail?.message === 'string') return detail.message
    if (typeof detail === 'string') return detail
  }
  return 'Не удалось войти. Попробуйте ещё раз.'
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const usernameRef = useRef(null)

  useEffect(() => {
    // Not `autoFocus`: on a phone that opens the keyboard over the form
    // before the page has settled. Focus only where there is room for it.
    if (window.matchMedia?.('(min-width: 640px)').matches) usernameRef.current?.focus()
  }, [])

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await signIn(username.trim(), password)
      // Nothing to do on success: the provider swaps this screen for the app.
    } catch (err) {
      setError(messageFor(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <LoginBackdrop />
      <form className="login-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1 className="login-title">Вход</h1>
        <p className="login-subtitle">Войдите, чтобы открыть сетлист группы.</p>

        <label className="login-field">
          <span>Логин</span>
          <input
            ref={usernameRef}
            className="settings-text-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={60}
            required
          />
        </label>

        <label className="login-field">
          <span>Пароль</span>
          <input
            className="settings-text-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={256}
            required
          />
        </label>

        {/* `role="alert"` so a screen reader announces the failure instead of
            leaving the user waiting on a form that silently did nothing. */}
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="accent-btn login-submit"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? 'Входим…' : 'Войти'}
        </button>

        {/* <p className="login-note">
          Учётные записи заводит админ.
        </p> */}
      </form>
    </div>
  )
}
