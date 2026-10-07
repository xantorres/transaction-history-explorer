import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react'

const DEBOUNCE_MS = 300

interface DebouncedInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  label: string
  value: string
  parse?: (draft: string) => string
  invalidMessage?: string
  error?: string
  onCommit: (value: string, mode: 'push' | 'replace') => void
}

const trim = (draft: string) => draft.trim()

export function DebouncedInput({
  label,
  value,
  parse = trim,
  invalidMessage,
  error,
  onCommit,
  ...props
}: DebouncedInputProps) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  // A half-typed date reads as '', so only the browser can tell it from a cleared field.
  const [incomplete, setIncomplete] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const committed = useRef<string>(undefined)
  const composing = useRef(false)
  const id = useId()

  const invalid = (text: string) => text.trim() !== '' && parse(text) === ''

  // Only an outside change (history, Clear filters) rewrites what the user typed.
  if (value !== synced) {
    setSynced(value)
    setIncomplete(false)
    if (parse(draft) !== value || invalid(draft)) setDraft(value)
  }

  useEffect(() => {
    // Back or Forward moved off this burst's entry, so the next commit pushes a new one.
    if (value !== committed.current) committed.current = undefined
    if (input.current?.validity.badInput) input.current.value = value
    return () => {
      clearTimeout(timer.current)
    }
  }, [value])

  function schedule(next: string) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      commit(next)
    }, DEBOUNCE_MS)
  }

  function commit(next: string) {
    clearTimeout(timer.current)
    const parsed = parse(next)
    if (parsed === value || invalid(next) || input.current?.validity.badInput) return
    onCommit(parsed, committed.current === undefined ? 'push' : 'replace')
    committed.current = parsed
  }

  const unusable = invalid(draft) || incomplete
  const message = unusable ? invalidMessage : error

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        ref={input}
        id={id}
        value={draft}
        aria-invalid={unusable || error !== undefined || undefined}
        aria-describedby={message && `${id}-message`}
        onFocus={() => {
          committed.current = undefined
        }}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          setIncomplete(event.target.validity.badInput)
          if (composing.current) clearTimeout(timer.current)
          else schedule(next)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          schedule(event.currentTarget.value)
        }}
        onBlur={() => {
          commit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !composing.current) commit(draft)
        }}
      />
      {message && (
        <p id={`${id}-message`} className="field-error">
          {message}
        </p>
      )}
    </div>
  )
}
