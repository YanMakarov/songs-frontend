import { useEffect, useState } from 'react'
import { useInstallState } from '../lib/install.js'
import { BrandMark } from './LoginBackdrop.jsx'

// The offer to install, where it can actually be found.
//
// The settings screen has had an install button all along, but nobody opens
// settings looking for something they do not know exists. This asks once, in
// the way the browser's own mini-infobar would have — that infobar is
// suppressed in lib/install.js, so something has to take its place.
//
// Asked once and never again: a prompt that returns after being dismissed is
// no longer an offer. Closing it closes it — a second toast explaining where
// the button lives would be a reply to «нет», and the settings screen keeps
// the button either way.

const DISMISSED_KEY = 'chords_app_install_prompt_dismissed_v1'

//: Long enough that the songs are on screen first. Being asked to install
//: something before seeing what it is invites a reflexive "нет".
const APPEAR_DELAY_MS = 2500

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Blocked storage: treat it as dismissed rather than asking on every
    // single launch with no way to make it stop.
    return true
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Worst case the offer appears once more.
  }
}

export default function InstallPrompt() {
  const { canPrompt, installed, platform, promptInstall } = useInstallState()
  const [open, setOpen] = useState(false)

  // iOS hands out no install event ever, so there the offer is an
  // explanation. It is also where the two taps that do the job are hardest to
  // discover, which makes it the case most worth showing.
  const offerable = canPrompt || (platform === 'ios' && !installed)

  useEffect(() => {
    if (!offerable || installed || wasDismissed()) return undefined
    const id = setTimeout(() => setOpen(true), APPEAR_DELAY_MS)
    return () => clearTimeout(id)
  }, [offerable, installed])

  // Installed from anywhere — the browser menu, another tab — retires this.
  useEffect(() => {
    if (installed) setOpen(false)
  }, [installed])

  function dismiss() {
    markDismissed()
    setOpen(false)
  }

  async function install() {
    await promptInstall()
    markDismissed()
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="install-prompt" role="region" aria-label="Установка приложения">
      <BrandMark />
      <div className="install-prompt-text">
        <div className="install-prompt-title">Установить приложение?</div>
        <p className="install-prompt-body">
          {platform === 'ios' ? (
            <>
              В Safari: «Поделиться» <span aria-hidden="true">→</span> «На экран „Домой“». Песни
              будут открываться с рабочего стола и без интернета.
            </>
          ) : (
            'Иконка на рабочем столе, запуск без адресной строки, песни доступны без интернета.'
          )}
        </p>
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="ghost-btn install-prompt-later" onClick={dismiss}>
          {platform === 'ios' ? 'Понятно' : 'Позже'}
        </button>
        {canPrompt ? (
          <button type="button" className="install-prompt-go" onClick={install}>
            Установить
          </button>
        ) : null}
      </div>
    </div>
  )
}
