import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const OFFSET = 10
const VIEWPORT_MARGIN = 8

export default function Tooltip({ label, placement = 'top', children, disabled = false }) {
  const anchorRef = useRef(null)
  const bubbleRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [anchorRect, setAnchorRect] = useState(null)
  const [bubblePlacement, setBubblePlacement] = useState(placement)
  const bubbleId = useId()

  function calcCoords(rect, size, desiredPlacement) {
    if (!rect) return { top: 0, left: 0 }
    const { width, height } = size
    if (desiredPlacement === 'bottom') {
      return {
        top: rect.bottom + OFFSET,
        left: rect.left + rect.width / 2 - width / 2,
      }
    }
    if (desiredPlacement === 'left') {
      return {
        top: rect.top + rect.height / 2 - height / 2,
        left: rect.left - OFFSET - width,
      }
    }
    if (desiredPlacement === 'right') {
      return {
        top: rect.top + rect.height / 2 - height / 2,
        left: rect.right + OFFSET,
      }
    }
    // top
    return {
      top: rect.top - OFFSET - height,
      left: rect.left + rect.width / 2 - width / 2,
    }
  }

  function fitsViewport(coords, size) {
    if (typeof window === 'undefined') return true
    return (
      coords.top >= VIEWPORT_MARGIN &&
      coords.left >= VIEWPORT_MARGIN &&
      coords.top + size.height <= window.innerHeight - VIEWPORT_MARGIN &&
      coords.left + size.width <= window.innerWidth - VIEWPORT_MARGIN
    )
  }

  function clampToViewport(coords, size) {
    if (typeof window === 'undefined') return coords
    return {
      top: Math.min(
        Math.max(coords.top, VIEWPORT_MARGIN),
        window.innerHeight - VIEWPORT_MARGIN - size.height,
      ),
      left: Math.min(
        Math.max(coords.left, VIEWPORT_MARGIN),
        window.innerWidth - VIEWPORT_MARGIN - size.width,
      ),
    }
  }

  function resolvePlacement(rect, size, preferred) {
    if (!rect) return { placement: preferred, coords: { top: 0, left: 0 } }
    const order =
      preferred === 'left'
        ? ['left', 'right', 'top', 'bottom']
        : preferred === 'right'
          ? ['right', 'left', 'top', 'bottom']
          : preferred === 'bottom'
            ? ['bottom', 'top', 'right', 'left']
            : ['top', 'bottom', 'right', 'left']
    for (const option of order) {
      const coords = calcCoords(rect, size, option)
      if (fitsViewport(coords, size)) {
        return { placement: option, coords }
      }
    }
    const fallbackCoords = clampToViewport(calcCoords(rect, size, preferred), size)
    return { placement: preferred, coords: fallbackCoords }
  }

  function show() {
    if (disabled) return
    const node = anchorRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setAnchorRect(rect)
    setBubblePlacement(placement)
    setVisible(true)
  }

  function hide() {
    setVisible(false)
  }

  useLayoutEffect(() => {
    if (!visible || !anchorRect || !bubbleRef.current) return
    const bubbleBox = bubbleRef.current.getBoundingClientRect()
    const size = { width: bubbleBox.width, height: bubbleBox.height }
    const { placement: nextPlacement, coords } = resolvePlacement(anchorRect, size, placement)
    setBubblePlacement(nextPlacement)
    setPosition(coords)
  }, [visible, anchorRect, placement])

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  return (
    <span
      className="tooltip-anchor"
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? bubbleId : undefined}
    >
      {children}
      {visible && !disabled && portalTarget &&
        createPortal(
          <div
            ref={bubbleRef}
            className={`tooltip-bubble tooltip-${bubblePlacement}`}
            id={bubbleId}
            style={{ top: position.top, left: position.left }}
          >
            {label}
          </div>,
          portalTarget,
        )}
    </span>
  )
}
