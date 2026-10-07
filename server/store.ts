import {
  CURRENCIES,
  SORTS,
  type Category,
  type Currency,
  type CurrencyTotals,
  type Page,
  type Sort,
  type Status,
  type Summary,
  type Transaction,
} from '../src/domain.ts'
import { minorDigits, toMinorBound } from '../src/money.ts'

export interface Filters {
  q?: string
  from?: number
  to?: number
  min?: string
  max?: string
  currency?: Currency
  status?: Status
  category?: Category
}

export class CursorError extends Error {}

interface Entry {
  row: Transaction
  date: number
  amount: number
  text: string
}

type Key = 'date' | 'amount'

const FACE_DIGITS = Math.max(...CURRENCIES.map(minorDigits))

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en')

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function fingerprint(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const encodeCursor = (value: [number, string, string]) =>
  btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

function decodeCursor(cursor: string, query: string): [number, string] {
  let value: unknown
  try {
    value = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')))
  } catch {
    value = null
  }
  if (
    Array.isArray(value) &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'string' &&
    value[2] === query
  ) {
    return [value[0], value[1]]
  }
  throw new CursorError('The cursor does not belong to this query')
}

function matcher(filters: Filters) {
  const { q, from, to, min, max, currency, status, category } = filters
  const needle = q ? fold(q) : ''
  const bounds = Object.fromEntries(
    CURRENCIES.map((code) => [
      code,
      [
        min ? toMinorBound(min, code, 'ceil') : 0,
        max ? toMinorBound(max, code, 'floor') : Infinity,
      ],
    ]),
  ) as Record<Currency, [number, number]>

  return ({ row, date, text }: Entry) => {
    const [low, high] = bounds[row.currency]
    const size = Math.abs(row.amount)
    return (
      (from === undefined || date >= from) &&
      (to === undefined || date < to) &&
      (!currency || row.currency === currency) &&
      (!status || row.status === status) &&
      (!category || row.category === category) &&
      size >= low &&
      size <= high &&
      (!needle || text.includes(needle))
    )
  }
}

export function createStore(rows: Transaction[]) {
  const entries: Entry[] = rows.map((row) => ({
    row,
    date: Date.parse(row.timestamp),
    amount: row.amount * 10 ** (FACE_DIGITS - minorDigits(row.currency)),
    text: fold(`${row.counterparty}\n${row.description}\n${row.id}`),
  }))
  const byId = new Map(rows.map((row) => [row.id, row]))

  const compare = (key: Key, direction: number, entry: Entry, value: number, id: string) =>
    direction * (entry[key] - value || compareIds(entry.row.id, id))

  const orders = new Map(
    SORTS.map((sort) => {
      const key: Key = sort.endsWith('date') ? 'date' : 'amount'
      const direction = sort.startsWith('-') ? -1 : 1
      const order = entries.toSorted((a, b) => compare(key, direction, a, b[key], b.row.id))
      return [sort, { key, direction, order }]
    }),
  )

  function list(filters: Filters, sort: Sort, cursor: string | null, limit: number): Page {
    const plan = orders.get(sort)
    if (!plan) throw new RangeError(`Unknown sort ${sort}`)
    const { key, direction, order } = plan
    const { q, from, to, min, max, currency, status, category } = filters
    const query = fingerprint(
      JSON.stringify([q, from, to, min, max, currency, status, category, sort]),
    )
    let start = 0
    if (cursor) {
      const [value, id] = decodeCursor(cursor, query)
      let high = order.length
      while (start < high) {
        const middle = (start + high) >>> 1
        const entry = order[middle]
        if (entry && compare(key, direction, entry, value, id) <= 0) start = middle + 1
        else high = middle
      }
    }

    const matches = matcher(filters)
    const page: Entry[] = []
    for (let index = start; index < order.length; index++) {
      const entry = order[index]
      if (!entry || !matches(entry)) continue
      if (page.length === limit) {
        const last = page[page.length - 1]
        const nextCursor = last ? encodeCursor([last[key], last.row.id, query]) : null
        return { items: page.map((item) => item.row), nextCursor }
      }
      page.push(entry)
    }
    return { items: page.map((item) => item.row), nextCursor: null }
  }

  function summary(filters: Filters): Summary {
    const matches = matcher(filters)
    const totals = new Map<Currency, CurrencyTotals>()
    let count = 0
    for (const entry of entries) {
      if (!matches(entry)) continue
      count++
      const { currency, amount, status } = entry.row
      let total = totals.get(currency)
      if (!total) {
        total = { currency, in: 0, out: 0, pending: 0 }
        totals.set(currency, total)
      }
      if (status === 'BOOKED' && amount > 0) total.in += amount
      else if (status === 'BOOKED') total.out += amount
      else if (status === 'PENDING') total.pending += amount
    }
    return { count, perCurrency: CURRENCIES.flatMap((currency) => totals.get(currency) ?? []) }
  }

  return { list, summary, get: (id: string) => byId.get(id) }
}

export type Store = ReturnType<typeof createStore>
