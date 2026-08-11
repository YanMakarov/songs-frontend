// Theme application: light / dark / system, driven by data-theme attribute on <html>.

let mediaQuery = null
let mediaListener = null

export function applyTheme(theme) {
  const root = document.documentElement
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
    mediaQuery = null
    mediaListener = null
  }
  if (theme === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      root.setAttribute('data-theme', mediaQuery.matches ? 'dark' : 'light')
    }
    update()
    mediaListener = update
    mediaQuery.addEventListener('change', mediaListener)
  } else {
    root.setAttribute('data-theme', theme)
  }
}
