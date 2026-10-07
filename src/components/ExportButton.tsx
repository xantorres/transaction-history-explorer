import { useState } from 'react'
import type { Filters } from '../api.ts'
import { today } from '../dates.ts'
import type { Sort } from '../domain.ts'
import { download, exportCsv } from '../export.ts'

interface ExportButtonProps {
  filters: Filters
  sort: Sort
  total: number | undefined
}

interface Job {
  controller: AbortController
  rows: number
  total: number | undefined
}

const count = (value: number) => value.toLocaleString(navigator.language)

const describe = ({ rows, total }: Job) =>
  total === undefined ? `${count(rows)} rows` : `${count(rows)} of ${count(total)} rows`

export function ExportButton({ filters, sort, total }: ExportButtonProps) {
  const [job, setJob] = useState<Job>()
  const [failed, setFailed] = useState(false)

  async function start() {
    const controller = new AbortController()
    setJob({ controller, rows: 0, total })
    setFailed(false)
    try {
      const file = await exportCsv(filters, sort, {
        signal: controller.signal,
        onProgress: (rows) => {
          setJob((current) => current && { ...current, rows })
        },
      })
      download(file, `transactions-${today()}.csv`)
    } catch {
      setFailed(!controller.signal.aborted)
    }
    setJob(undefined)
  }

  return (
    <div className="export">
      <span role="status">{job ? describe(job) : failed && "Couldn't export. Try again."}</span>
      <button
        type="button"
        onClick={(event) => {
          // A double click's second click lands on whatever its first click put here.
          if (event.detail > 1) return
          if (job) job.controller.abort()
          else void start()
        }}
      >
        {job ? 'Cancel' : 'Export CSV'}
      </button>
    </div>
  )
}
