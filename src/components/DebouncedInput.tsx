import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

const DEBOUNCE_MS = 300

interface DebouncedInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  label: string
  value: string
  parse?: (draft: string) => string
  onCommit: (value: string, mode: 'push' | 'replace') => void
}

const trim = (draft: string) => draft.trim()

export function DebouncedInput({
  label,
  value,
  parse = trim,
  onCommit,
  ...props
}: DebouncedInputProps) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pushed = useRef(false)

  // Only an outside change (history, Clear filters) rewrites what the user typed.
  if (value !== synced) {
    setSynced(value)
    if (value !== parse(draft)) setDraft(value)
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [value],
  )

  function commit(next: string) {
    clearTimeout(timer.current)
    const parsed = parse(next)
    if (parsed === value) return
    onCommit(parsed, pushed.current ? 'replace' : 'push')
    pushed.current = true
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...props}
        value={draft}
        aria-invalid={(draft.trim() !== '' && parse(draft) === '') || undefined}
        onFocus={() => {
          pushed.current = false
        }}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            commit(next)
          }, DEBOUNCE_MS)
        }}
        onBlur={() => {
          commit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft)
        }}
      />
    </label>
  )
}
