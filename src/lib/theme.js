// Theme application: light / dark / system, driven by data-theme attribute on <html>.

let mediaQuery = null
let mediaListener = null

/**
 * Keep the browser/status-bar colour on the theme the user actually picked.
 *
 * index.html declares two `theme-color` tags behind `prefers-color-scheme`,
 * which is all that can be known before the app boots. Once it has booted the
 * choice may be the opposite of the OS setting, and in standalone mode that
 * shows up as a status bar in the wrong colour above the app. The browser uses
 * the first `theme-color` whose media matches, so a media-less tag placed at
 * the top of <head> outranks both static ones.
 */
function syncThemeColor(root) {
  const color = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (!color) return
  let meta = document.querySelector('meta[name="theme-color"][data-dynamic]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('data-dynamic', '')
    document.head.prepend(meta)
  }
  meta.setAttribute('content', color)
}

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
      syncThemeColor(root)
    }
    update()
    mediaListener = update
    mediaQuery.addEventListener('change', mediaListener)
  } else {
    root.setAttribute('data-theme', theme)
    syncThemeColor(root)
  }
}
