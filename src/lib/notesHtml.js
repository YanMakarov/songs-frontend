// Sanitiser for the notes editor.
//
// The editor is a contenteditable, so two untrusted-ish sources of markup end
// up in it: whatever the browser's own editing commands produce, and whatever
// the user pastes from another app. Everything is funnelled through here on
// the way in and on the way out, so what is stored — and later re-inserted as
// innerHTML — can only ever be the small tag set below.
//
// The intent is a note, not a document: bold, italic, underline, strikethrough,
// links, and line breaks. Anything block-like collapses to a plain <div> line, which is
// also why a pasted list arrives as ordinary lines rather than turning the
// note into a list.

// <strike> is what execCommand still emits in Chrome; <del> is what a paste
// from a document editor brings in. Both are the same thing on screen.
const INLINE_TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's' }

const BLOCK_TAGS = new Set([
  'DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE',
  'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FIGURE', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD',
])

// Dropped with their contents — nothing inside them is text the user wrote.
const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'NOSCRIPT',
  'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT',
  'OPTION', 'IMG', 'PICTURE', 'AUDIO', 'VIDEO', 'CANVAS', 'HEAD', 'TITLE',
])

const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i
const LOOKS_LIKE_DOMAIN = /^[\w-]+(\.[\w-]+)+(\/.*)?$/

/** A usable href, or null if the link should be dropped (javascript:, data:…). */
export function safeHref(raw) {
  const value = (raw || '').trim()
  if (!value) return null
  if (SAFE_SCHEME.test(value)) return value
  // "example.com/song" — what a person types when asked for a link.
  if (LOOKS_LIKE_DOMAIN.test(value)) return `https://${value}`
  return null
}

export function sanitizeNotesHtml(html) {
  if (typeof html !== 'string' || html === '') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const target = doc.createElement('div')
  appendClean(doc, doc.body, target)
  return target.innerHTML
}

function appendClean(doc, source, target) {
  for (const node of Array.from(source.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(node.nodeValue))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const tag = node.tagName
    if (DROP_TAGS.has(tag)) continue

    if (tag === 'BR') {
      target.appendChild(doc.createElement('br'))
      continue
    }

    if (tag === 'A') {
      const href = safeHref(node.getAttribute('href'))
      // A link we will not keep still had text in it; keep the text.
      if (!href) {
        appendClean(doc, node, target)
        continue
      }
      const anchor = doc.createElement('a')
      anchor.setAttribute('href', href)
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
      appendClean(doc, node, anchor)
      target.appendChild(anchor)
      continue
    }

    if (INLINE_TAGS[tag]) {
      const el = doc.createElement(INLINE_TAGS[tag])
      appendClean(doc, node, el)
      target.appendChild(el)
      continue
    }

    if (BLOCK_TAGS.has(tag)) {
      const el = doc.createElement('div')
      appendClean(doc, node, el)
      target.appendChild(el)
      continue
    }

    // Anything else (span, font, mark…) is unwrapped rather than dropped: the
    // wrapper carried the formatting we are refusing, not the words.
    appendClean(doc, node, target)
  }
}

/** Whitespace, empty lines and stray <br>s only — nothing worth saving. */
export function isEmptyNotesHtml(html) {
  if (!html) return true
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return (doc.body.textContent || '').trim() === ''
}

/** Plain text with line breaks — used to seed the link dialog and nothing else. */
export function notesHtmlToText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return doc.body.textContent || ''
}
