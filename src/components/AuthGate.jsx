import App from '../App.jsx'
import LoginPage from './LoginPage.jsx'
import { useAuth } from '../lib/auth.jsx'

// Chooses between the app and the login screen — and, more importantly,
// decides what to do when it cannot tell.
//
// The rule is that only the server sends anyone to the login screen. A cold
// start with no signal keeps whatever the last session said and shows the
// cached setlist, because the alternative is a login form on a stage with no
// way to submit it.

export default function AuthGate() {
  const { canUseApp, checking, user, unverified } = useAuth()

  if (canUseApp) {
    return (
      <>
        <App />
        {unverified ? (
          <div className="auth-offline-note" role="status">
            Офлайн — вход не проверен
          </div>
        ) : null}
      </>
    )
  }

  // No remembered session and the server has not answered yet. Brief, and
  // only on a first run or after signing out — with a snapshot the branch
  // above already rendered the app.
  if (checking && !user) {
    return <div className="login-splash">Открываем песенник…</div>
  }

  return <LoginPage />
}
