import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

const FAULTS = { list: 'Table', page: 'Next pages', summary: 'Summary', detail: 'Details' }

const readFaults = () => /(?:^|;\s*)faults=([^;]*)/.exec(document.cookie)?.[1]?.split(',') ?? []

function writeFaults(faults: string[]) {
  document.cookie = `faults=${faults.join(',')}; path=/`
}

export function DevFaults() {
  const client = useQueryClient()
  const [faults, setFaults] = useState(readFaults)

  function toggle(fault: string, on: boolean) {
    const next = on ? [...faults, fault] : faults.filter((name) => name !== fault)
    writeFaults(next)
    setFaults(next)
    void client.resetQueries()
  }

  return (
    <footer className="dev-faults">
      <span>Simulate failures:</span>
      {Object.entries(FAULTS).map(([fault, label]) => (
        <label key={fault}>
          <input
            type="checkbox"
            checked={faults.includes(fault)}
            onChange={(event) => {
              toggle(fault, event.target.checked)
            }}
          />
          {label}
        </label>
      ))}
    </footer>
  )
}
