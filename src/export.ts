import { fetchPage } from './api.ts'
import type { Filters } from './api.ts'
import { CSV_HEADER, transactionCsvRow } from './csv.ts'
import type { Sort } from './domain.ts'

const CHUNK_ROWS = 5000

interface ExportOptions {
  signal: AbortSignal
  onProgress: (rows: number) => void
}

export async function exportCsv(
  filters: Filters,
  sort: Sort,
  { signal, onProgress }: ExportOptions,
) {
  const parts = [CSV_HEADER]
  let rows = 0
  let cursor: string | null = ''
  do {
    const page = await fetchPage({ ...filters, sort, cursor, limit: String(CHUNK_ROWS) }, signal)
    parts.push(page.items.map(transactionCsvRow).join(''))
    rows += page.items.length
    onProgress(rows)
    cursor = page.nextCursor
  } while (cursor)
  return new Blob(parts, { type: 'text/csv;charset=utf-8' })
}

export function download(file: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(file)
  link.download = name
  link.click()
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(link.href)
  }, 60_000)
}
