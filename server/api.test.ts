import { describe, expect, test } from 'vitest'
import type { Page, Summary } from '../src/domain.ts'
import { createApi } from './api.ts'
import { generateTransactions } from './data.ts'
import { createStore } from './store.ts'

const rows = generateTransactions(300)
const api = createApi({ store: createStore(rows), latency: () => 0, simulateFaults: true })

const get = (path: string, init?: RequestInit) => api(new Request(`http://localhost${path}`, init))

const read = async (path: string): Promise<unknown> => (await get(path)).json()

describe('GET /api/transactions', () => {
  test('pages with an opaque cursor', async () => {
    const first = (await read('/api/transactions?limit=200')) as Page
    expect(first.items).toHaveLength(200)
    const second = (await read(
      `/api/transactions?limit=200&cursor=${String(first.nextCursor)}`,
    )) as Page
    expect(second.items).toHaveLength(100)
    expect(second.nextCursor).toBeNull()
  })

  test('filters by a UTC range and sorts on request', async () => {
    const { items } = (await read(
      '/api/transactions?from=2025-01-01T00:00:00.000Z&to=2025-02-01T00:00:00Z&sort=date',
    )) as Page
    const instants = items.map((item) => Date.parse(item.timestamp))
    expect(instants.length).toBeGreaterThan(0)
    expect(instants).toEqual(instants.toSorted((a, b) => a - b))
    expect(Math.min(...instants)).toBeGreaterThanOrEqual(Date.parse('2025-01-01T00:00:00Z'))
    expect(Math.max(...instants)).toBeLessThan(Date.parse('2025-02-01T00:00:00Z'))
  })

  test.each([
    ['from', 'from=2025-01-01T00:00:00+02:00'],
    ['to', 'to=yesterday'],
    ['min', 'min=-5'],
    ['currency', 'currency=XAU'],
    ['status', 'status=booked'],
    ['category', 'category=Gifts'],
    ['sort', 'sort=counterparty'],
    ['limit', 'limit=5001'],
  ])('rejects an invalid %s', async (param, query) => {
    const response = await get(`/api/transactions?${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_param', param } })
  })

  test('rejects a cursor issued for another query', async () => {
    const page = (await read('/api/transactions?limit=10&currency=EUR')) as Page
    const response = await get(
      `/api/transactions?limit=10&currency=GBP&cursor=${String(page.nextCursor)}`,
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_cursor' } })
  })
})

test('GET /api/summary totals the filtered result', async () => {
  const summary = (await read('/api/summary?currency=JPY')) as Summary
  expect(summary.count).toBe(rows.filter((row) => row.currency === 'JPY').length)
  expect(summary.perCurrency.map((total) => total.currency)).toEqual(['JPY'])
})

test('GET /api/transactions/:id returns one transaction or a 404', async () => {
  const row = rows[42]
  expect(await read(`/api/transactions/${String(row?.id)}`)).toEqual(row)
  const missing = await get('/api/transactions/tx_missing')
  expect(missing.status).toBe(404)
  expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } })
})

test('answers unknown routes and methods with errors', async () => {
  expect((await get('/api/accounts')).status).toBe(404)
  expect((await get('/api/transactions', { method: 'POST' })).status).toBe(405)
})

test('fails the endpoints named in the faults cookie', async () => {
  const headers = { cookie: 'theme=dark; faults=summary,page' }
  const page = (await read('/api/transactions?limit=10')) as Page
  expect((await get('/api/transactions?limit=10', { headers })).status).toBe(200)
  const next = await get(`/api/transactions?limit=10&cursor=${String(page.nextCursor)}`, {
    headers,
  })
  expect(next.status).toBe(500)
  expect((await get('/api/summary', { headers })).status).toBe(500)
  expect((await get(`/api/transactions/${String(rows[0]?.id)}`, { headers })).status).toBe(200)
})

test('ignores the faults cookie unless faults are simulated', async () => {
  const production = createApi({ store: createStore(rows), latency: () => 0 })
  const request = new Request('http://localhost/api/summary', {
    headers: { cookie: 'faults=summary' },
  })
  expect((await production(request)).status).toBe(200)
})

test('waits for its latency and gives up when the request is aborted', async () => {
  const slow = createApi({ store: createStore(rows), latency: () => 10_000 })
  const controller = new AbortController()
  const request = new Request('http://localhost/api/transactions', { signal: controller.signal })
  const response = slow(request)
  controller.abort()
  await expect(response).rejects.toThrow(/abort/i)
})
