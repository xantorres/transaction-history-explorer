import { describe, expect, test } from 'vitest'
import type { Sort, Transaction } from '../src/domain'
import { generateTransactions } from './data'
import { CursorError, createStore, type Filters } from './store'

let sequence = 0
const tx = (fields: Partial<Transaction>): Transaction => ({
  id: `tx_${String(++sequence).padStart(8, '0')}`,
  timestamp: '2026-01-15T12:00:00+00:00',
  counterparty: 'Atlas Office Supply',
  description: 'Purchase order PO-0001',
  amount: -1000,
  currency: 'EUR',
  category: 'Suppliers',
  status: 'BOOKED',
  ...fields,
})

function pageThrough(
  store: ReturnType<typeof createStore>,
  filters: Filters,
  sort: Sort,
  limit: number,
) {
  const ids: string[] = []
  let cursor: string | null = null
  do {
    const page = store.list(filters, sort, cursor, limit)
    ids.push(...page.items.map((item) => item.id))
    cursor = page.nextCursor
  } while (cursor)
  return ids
}

describe('list', () => {
  const plusTwo = tx({ timestamp: '2026-03-01T01:00:00+02:00' })
  const utc = tx({ timestamp: '2026-02-28T23:30:00+00:00' })
  const minusFive = tx({ timestamp: '2026-02-28T20:00:00-05:00' })
  const store = createStore([minusFive, utc, plusTwo])

  test('orders by instant, not by the local text of each offset', () => {
    const ids = (sort: Sort) => store.list({}, sort, null, 10).items.map((item) => item.id)
    expect(ids('date')).toEqual([plusTwo.id, utc.id, minusFive.id])
    expect(ids('-date')).toEqual([minusFive.id, utc.id, plusTwo.id])
  })

  test('filters an inclusive start and exclusive end in UTC', () => {
    const filters = {
      from: Date.parse('2026-02-28T23:00:00Z'),
      to: Date.parse('2026-02-28T23:30:00Z'),
    }
    expect(store.list(filters, 'date', null, 10).items).toEqual([plusTwo])
  })

  test('returns an empty page for an inverted range', () => {
    const filters = {
      from: Date.parse('2026-03-02T00:00:00Z'),
      to: Date.parse('2026-02-01T00:00:00Z'),
    }
    expect(store.list(filters, 'date', null, 10)).toEqual({ items: [], nextCursor: null })
  })

  test('matches currency, status and category exactly', () => {
    const rows = [
      tx({ currency: 'GBP' }),
      tx({ status: 'PENDING' }),
      tx({ category: 'Travel' }),
      tx({ currency: 'GBP', status: 'PENDING', category: 'Travel' }),
    ]
    const only = createStore(rows).list(
      { currency: 'GBP', status: 'PENDING', category: 'Travel' },
      'date',
      null,
      10,
    )
    expect(only.items).toEqual([rows[3]])
  })

  test('matches the absolute amount in the currency of each row', () => {
    const rows = [
      tx({ amount: -24999, currency: 'EUR' }),
      tx({ amount: 25000, currency: 'EUR' }),
      tx({ amount: 25001, currency: 'EUR' }),
      tx({ amount: 250, currency: 'JPY' }),
      tx({ amount: -249, currency: 'JPY' }),
    ]
    const page = createStore(rows).list({ min: '249.99', max: '250' }, 'date', null, 10)
    expect(page.items.map((item) => item.amount).sort()).toEqual([-24999, 25000, 250].sort())
  })

  test('searches counterparty, description and id ignoring case and accents', () => {
    const rows = [
      tx({ counterparty: 'Zürich Data Systems AG' }),
      tx({ description: 'Refund (partial) for Crème Brûlée Café' }),
      tx({ id: 'tx_cafe0001' }),
      tx({ counterparty: 'Northbeam Retail Co' }),
    ]
    const search = (q: string) =>
      createStore(rows)
        .list({ q }, 'date', null, 10)
        .items.map((item) => item.id)
    expect(search('ZURICH')).toEqual([rows[0]?.id])
    expect(search('(partial')).toEqual([rows[1]?.id])
    expect(search('cafe')).toEqual([rows[1]?.id, rows[2]?.id])
  })

  test('pages through ties without duplicates or gaps in both directions', () => {
    const rows = Array.from({ length: 23 }, (_, index) =>
      tx({ amount: index % 4 === 0 ? 5000 : -1000, currency: index % 3 ? 'EUR' : 'JPY' }),
    )
    const store = createStore(rows)
    for (const sort of ['amount', '-amount', 'date', '-date'] as const) {
      const all = store.list({}, sort, null, 100).items.map((item) => item.id)
      expect(pageThrough(store, {}, sort, 4)).toEqual(all)
      expect(new Set(all).size).toBe(rows.length)
    }
  })

  test('sorts amounts by face value across currencies', () => {
    const rows = [
      tx({ amount: 1200, currency: 'EUR' }),
      tx({ amount: 1200, currency: 'JPY' }),
      tx({ amount: -500, currency: 'GBP' }),
    ]
    const page = createStore(rows).list({}, '-amount', null, 10)
    expect(page.items).toEqual([rows[1], rows[0], rows[2]])
  })

  test('rejects a cursor issued for another query', () => {
    const store = createStore(Array.from({ length: 5 }, () => tx({})))
    const { nextCursor } = store.list({ currency: 'EUR' }, 'amount', null, 2)
    expect(nextCursor).not.toBeNull()
    expect(() => store.list({ currency: 'EUR' }, '-amount', nextCursor, 2)).toThrow(CursorError)
    expect(() => store.list({ currency: 'GBP' }, 'amount', nextCursor, 2)).toThrow(CursorError)
    expect(() => store.list({}, 'amount', 'not-a-cursor', 2)).toThrow(CursorError)
  })
})

describe('summary', () => {
  test('totals booked money per currency, keeps pending apart and never sums reversed', () => {
    const store = createStore([
      tx({ amount: 1000, status: 'BOOKED' }),
      tx({ amount: -300, status: 'BOOKED' }),
      tx({ amount: 50, status: 'PENDING' }),
      tx({ amount: -20, status: 'PENDING' }),
      tx({ amount: 999, status: 'REVERSED' }),
      tx({ amount: 1200, currency: 'JPY' }),
      tx({ amount: -500, currency: 'GBP', status: 'REVERSED' }),
    ])
    expect(store.summary({})).toEqual({
      count: 7,
      perCurrency: [
        { currency: 'EUR', in: 1000, out: -300, pending: 30 },
        { currency: 'GBP', in: 0, out: 0, pending: 0 },
        { currency: 'JPY', in: 1200, out: 0, pending: 0 },
      ],
    })
  })

  test('counts exactly the rows the list pages through', () => {
    const store = createStore(generateTransactions(3_000))
    const filters: Filters = { currency: 'EUR', min: '100', q: 'invoice' }
    const ids = pageThrough(store, filters, '-date', 250)
    expect(ids.length).toBeGreaterThan(250)
    expect(store.summary(filters).count).toBe(ids.length)
  })
})

test('get finds a row by id', () => {
  const row = tx({})
  const store = createStore([row])
  expect(store.get(row.id)).toBe(row)
  expect(store.get('tx_missing')).toBeUndefined()
})
