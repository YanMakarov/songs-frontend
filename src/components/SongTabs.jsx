import { IconMusic, IconNote } from './Icons.jsx'

// Bottom navigation for a single song, in the shape a phone app uses: a low,
// quiet strip that stays out of the way of the song itself. Deliberately not
// accented — it is a place switch, not an action.
const TABS = [
  { value: 'harmony', label: 'Гармония', Icon: IconMusic },
  { value: 'notes', label: 'Заметки', Icon: IconNote },
]

export default function SongTabs({ value, onChange, hasNotes }) {
  return (
    <nav className="song-tabs" role="tablist" aria-label="Разделы песни">
      {TABS.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`song-tab-${tab.value}`}
            aria-selected={active}
            aria-controls={`song-panel-${tab.value}`}
            className={'song-tab' + (active ? ' is-active' : '')}
            onClick={() => onChange(tab.value)}
          >
            <span className="song-tab-icon">
              <tab.Icon />
              {tab.value === 'notes' && hasNotes && <span className="song-tab-dot" aria-hidden />}
            </span>
            <span className="song-tab-label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
