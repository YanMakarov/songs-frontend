// The sign-in screen's decoration: the app's own icon, and the chord it draws.
//
// The icon is a chord box — a nut, six strings, three fingers in a row. That
// shape is A major in open position, so the backdrop draws the real thing
// rather than an ornament that merely looks like one: this is a guitar app,
// and a diagram that does not parse is worse than no diagram.

// Fret per string, low E to high e. -1 muted, 0 open. A major: x02220.
const A_MAJOR = [-1, 0, 2, 2, 2, 0]

const STRINGS = 6
const FRETS = 4
const LEFT = 30
const NUT_Y = 70
const STRING_GAP = 36
const FRET_GAP = 56

const stringX = (i) => LEFT + i * STRING_GAP
const fretY = (i) => NUT_Y + i * FRET_GAP
const RIGHT = stringX(STRINGS - 1)
const BOTTOM = fretY(FRETS)
//: Where open/muted markers sit, above the nut.
const MARKER_Y = NUT_Y - 22

/** The chord box behind the card. Decorative — hidden from assistive tech. */
export function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      {/* Two layers: a soft glow in the icon's colours for depth, and the
          diagram itself. `preserveAspectRatio` keeps the box centred on the
          card at any viewport. */}
      <div className="login-glow" />
      <svg
        className="login-fretboard"
        viewBox={`0 0 ${RIGHT + LEFT} ${BOTTOM + 30}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g strokeLinecap="round">
          {/* Nut: the thick bar that says "open position". */}
          <path
            d={`M${LEFT} ${NUT_Y}H${RIGHT}`}
            className="login-fret-nut"
            strokeWidth="6"
          />
          {Array.from({ length: FRETS }, (_, i) => (
            <path
              key={`fret-${i}`}
              d={`M${LEFT} ${fretY(i + 1)}H${RIGHT}`}
              className="login-fret"
              strokeWidth="3"
            />
          ))}
          {Array.from({ length: STRINGS }, (_, i) => (
            <path
              key={`string-${i}`}
              d={`M${stringX(i)} ${NUT_Y}V${BOTTOM}`}
              className="login-string"
              strokeWidth="3"
            />
          ))}
        </g>

        {A_MAJOR.map((fret, i) => {
          if (fret === -1) {
            const x = stringX(i)
            return (
              <g key={`mute-${i}`} className="login-marker" strokeWidth="2.5" strokeLinecap="round">
                <path d={`M${x - 5.5} ${MARKER_Y - 5.5}L${x + 5.5} ${MARKER_Y + 5.5}`} />
                <path d={`M${x + 5.5} ${MARKER_Y - 5.5}L${x - 5.5} ${MARKER_Y + 5.5}`} />
              </g>
            )
          }
          if (fret === 0) {
            return (
              <circle
                key={`open-${i}`}
                cx={stringX(i)}
                cy={MARKER_Y}
                r="6"
                className="login-marker"
                strokeWidth="2.5"
              />
            )
          }
          // Fretted: the dot sits between the two fret lines, not on one.
          return (
            <circle
              key={`dot-${i}`}
              cx={stringX(i)}
              cy={fretY(fret - 1) + FRET_GAP / 2}
              r="12"
              className="login-dot"
            />
          )
        })}
      </svg>
    </div>
  )
}

/**
 * The app icon, redrawn inline.
 *
 * Not an <img> of pwa-512.png: this has to render before the network is
 * trusted and on a cold offline start, and as markup it also picks up the
 * theme. Same geometry as public/favicon.svg so the sign-in screen and the
 * home-screen icon are recognisably the same app.
 */
export function BrandMark() {
  return (
    <svg
      className="login-mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Songs"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="login-mark-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A84FF" />
          <stop offset="1" stopColor="#5E5CE6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#login-mark-gradient)" />
      <g stroke="#fff" strokeLinecap="round">
        <path d="M13 21h38" strokeWidth="4" />
        <g strokeWidth="2" opacity="0.62">
          <path d="M14 22v28M23 22v28M32 22v28M41 22v28M50 22v28" />
        </g>
        <g strokeWidth="2" opacity="0.42">
          <path d="M13 29h38M13 36h38M13 43h38M13 50h38" />
        </g>
      </g>
      <g fill="#fff">
        <circle cx="23" cy="25.5" r="3.4" />
        <circle cx="32" cy="25.5" r="3.4" />
        <circle cx="41" cy="25.5" r="3.4" />
      </g>
    </svg>
  )
}
