import type { Transaction } from './domain.ts'
import { toDecimal } from './money.ts'

const FORMULA = /(?<=^|[;\t\r\n])(?=[=+\-@\t\r])/g
const NUMBER = /^-?\d+(\.\d+)?$/
const NEEDS_QUOTES = /[",\r\n]/

export function csvCell(value: string) {
  // Spreadsheets run a cell that starts like a formula, and locales that split cells on ; also
  // start one after a ;, tab or line break, even inside quotes. The apostrophe makes it text.
  const safe = NUMBER.test(value) ? value : value.replace(FORMULA, "'")
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const csvRow = (values: string[]) => `${values.map(csvCell).join(',')}\r\n`

// The byte order mark makes Excel read the file as UTF-8.
export const CSV_HEADER = `\uFEFF${csvRow([
  'id',
  'timestamp',
  'counterparty',
  'description',
  'category',
  'status',
  'currency',
  'amount',
])}`

export const transactionCsvRow = (row: Transaction) =>
  csvRow([
    row.id,
    row.timestamp,
    row.counterparty,
    row.description,
    row.category,
    row.status,
    row.currency,
    toDecimal(row.amount, row.currency),
  ])
