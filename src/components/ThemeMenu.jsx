import { useEffect, useRef, useState } from 'react'
import SegmentedControl from './SegmentedControl.jsx'
import { IconSun, IconMoon, IconAuto } from './Icons.jsx'
import Tooltip from './Tooltip.jsx'

const OPTIONS = [
  { value: 'light', label: 'Светлая' },
  { value: 'system', label: 'Как в системе' },
  { value: 'dark', label: 'Тёмная' },
]

export default function ThemeMenu({ theme, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const Icon = theme === 'dark' ? IconMoon : theme === 'light' ? IconSun : IconAuto

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <Tooltip label="Тема оформления">
        <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Тема оформления">
          <Icon />
        </button>
      </Tooltip>
      {open && (
        <div className="theme-menu-pop">
          <SegmentedControl
            name="theme"
            options={OPTIONS}
            value={theme}
            onChange={(v) => {
              onChange(v)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
