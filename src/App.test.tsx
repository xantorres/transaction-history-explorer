import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ROW_HEIGHT } from './components/TransactionTable.tsx'
import { formatMoney } from './money.ts'
import { installApi, store } from './test/api-stub.ts'
import { dataRows, field, hrefAt, renderApp, rowAt, waitForRows } from './test/app.tsx'

test('renders the first page of the result described by the URL', async () => {
  const api = installApi()
  renderApp('?currency=GBP&sort=amount')
  const [first] = store.list({ currency: 'GBP' }, 'amount', null, 100).items
  await waitForRows()
  expect(hrefAt(2)).toBe(`?currency=GBP&sort=amount&tx=${String(first?.id)}`)
  expect(rowAt(2)?.textContent).toContain(formatMoney(first?.amount ?? 0, 'GBP'))
  expect(dataRows().length).toBeLessThan(40)
  expect(api.requests[0]?.url.searchParams.toString()).toBe('currency=GBP&sort=amount')
})

test('loads the next page as the user scrolls towards the end', async () => {
  const api = installApi()
  renderApp()
  await waitForRows()
  const [, body] = screen.getAllByRole('rowgroup')
  const { nextCursor } = store.list({}, '-date', null, 100)
  const [next] = store.list({}, '-date', nextCursor, 100).items
  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 90 * ROW_HEIGHT } })
  await waitFor(() => {
    expect(api.requests.at(-1)?.url.searchParams.get('cursor')).toBe(nextCursor)
  })
  await waitFor(() => {
    expect(hrefAt(102)).toBe(`?tx=${String(next?.id)}`)
  })
})

test('sorts from the column headers through the URL', async () => {
  const api = installApi()
  renderApp()
  const amount = await screen.findByRole('columnheader', { name: 'Amount' })
  const date = screen.getByRole('columnheader', { name: 'Date' })
  expect(date.getAttribute('aria-sort')).toBe('descending')
  expect(amount.getAttribute('aria-sort')).toBeNull()

  fireEvent.click(within(amount).getByRole('button'))
  expect(location.search).toBe('?sort=-amount')
  expect(amount.getAttribute('aria-sort')).toBe('descending')
  const requested = (path: string) => api.requests.filter(({ url }) => url.pathname === path)
  await waitFor(() => {
    expect(requested('/api/transactions').at(-1)?.url.searchParams.get('sort')).toBe('-amount')
  })
  expect(requested('/api/summary')).toHaveLength(1)
  fireEvent.click(within(amount).getByRole('button'))
  expect(location.search).toBe('?sort=amount')
  expect(amount.getAttribute('aria-sort')).toBe('ascending')
  fireEvent.click(within(date).getByRole('button'))
  expect(location.search).toBe('')
})

test('a new result starts at the top of the table', async () => {
  installApi()
  renderApp()
  await waitForRows()
  const [, body] = screen.getAllByRole('rowgroup') as [HTMLElement, HTMLElement]
  fireEvent.scroll(body, { target: { scrollTop: 40 * ROW_HEIGHT } })
  expect(body.scrollTop).toBe(40 * ROW_HEIGHT)
  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  expect(body.scrollTop).toBe(0)
})

test('labels each row with its status', async () => {
  installApi()
  renderApp('?status=PENDING')
  await waitForRows()
  expect(within(rowAt(2) as HTMLElement).getByText('Pending')).toBeDefined()
})

test('rewrites a hand-edited URL into its canonical form', async () => {
  installApi()
  renderApp('?sort=-date&currency=XAU&status=PENDING&utm_source=mail')
  await screen.findByRole('table', { name: 'Transactions' })
  expect(location.search).toBe('?status=PENDING')
})
