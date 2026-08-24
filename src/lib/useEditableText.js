import { useEffect, useRef, useState } from 'react'

/**
 * Text state for a field whose value round-trips through the query cache.
 *
 * A field bound straight to `song.title` or `line.lyrics` looks controlled but
 * is not, quite: the keystroke is written to the cache, and the cache tells
 * its subscribers in a microtask — *after* the input event is over. React
 * re-renders then, finds the DOM one character ahead of the value it last
 * rendered, and writes the value back into the element. Writing the value of a
 * focused field puts the caret at its end, so a letter typed into the middle
 * of a word threw the cursor to the end of the text; the usual caret
 * restoration only covers updates made during the event itself.
 *
 * So the field reads from local state, which is by definition exactly what the
 * user typed, and the incoming value is adopted only when it differs from the
 * one we last sent up — that is, when the change came from somewhere else:
 * another device, an undo, a transposition swap.
 */
export function useEditableText(value, onCommit) {
  const [text, setText] = useState(value)
  const sentRef = useRef(value)

  useEffect(() => {
    if (value === sentRef.current) return
    sentRef.current = value
    setText(value)
  }, [value])

  function change(next) {
    sentRef.current = next
    setText(next)
    onCommit(next)
  }

  return [text, change]
}
