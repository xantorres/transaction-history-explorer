import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.tsx'
import { createQueryClient } from './api.ts'
import { ROW_HEIGHT } from './components/TransactionTable.tsx'
import { formatMoney } from './money.ts'
import { installApi, store } from './test/api-stub.ts'

function renderApp(search = '') {
  history.replaceState(null, '', `/${search}`)
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  )
}

const dataRows = () =>
  screen.getAllByRole('row').filter((row) => Number(row.getAttribute('aria-rowindex')) > 1)

const rowAt = (rowIndex: number) =>
  screen.getAllByRole('row').find((row) => row.getAttribute('aria-rowindex') === String(rowIndex))

test('renders the first page of the result described by the URL', async () => {
  const api = installApi()
  renderApp('?currency=GBP&sort=amount')
  const [first] = store.list({ currency: 'GBP' }, 'amount', null, 100).items
  await waitFor(() => {
    expect(rowAt(2)).toBeDefined()
  })
  const row = rowAt(2) as HTMLElement
  expect(within(row).getByRole('link').getAttribute('href')).toBe(
    `?currency=GBP&sort=amount&tx=${String(first?.id)}`,
  )
  expect(row.textContent).toContain(formatMoney(first?.amount ?? 0, 'GBP'))
  expect(dataRows().length).toBeLessThan(40)
  expect(api.requests[0]?.searchParams.toString()).toBe('currency=GBP&sort=amount')
})

test('loads the next page as the user scrolls towards the end', async () => {
  const api = installApi()
  renderApp()
  await waitFor(() => {
    expect(rowAt(2)).toBeDefined()
  })
  const [, body] = screen.getAllByRole('rowgroup')
  const { nextCursor } = store.list({}, '-date', null, 100)
  const [next] = store.list({}, '-date', nextCursor, 100).items
  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 90 * ROW_HEIGHT } })
  await waitFor(() => {
    expect(api.requests.at(-1)?.searchParams.get('cursor')).toBe(nextCursor)
  })
  await waitFor(() => {
    expect(
      within(rowAt(102) as HTMLElement)
        .getByRole('link')
        .getAttribute('href'),
    ).toBe(`?tx=${String(next?.id)}`)
  })
})

test('sorts from the column headers through the URL', async () => {
  installApi()
  renderApp()
  const amount = await screen.findByRole('columnheader', { name: 'Amount' })
  const date = screen.getByRole('columnheader', { name: 'Date' })
  expect(date.getAttribute('aria-sort')).toBe('descending')
  expect(amount.getAttribute('aria-sort')).toBeNull()

  fireEvent.click(within(amount).getByRole('button'))
  expect(location.search).toBe('?sort=-amount')
  expect(amount.getAttribute('aria-sort')).toBe('descending')
  fireEvent.click(within(amount).getByRole('button'))
  expect(location.search).toBe('?sort=amount')
  expect(amount.getAttribute('aria-sort')).toBe('ascending')
  fireEvent.click(within(date).getByRole('button'))
  expect(location.search).toBe('')
})

test('rewrites a hand-edited URL into its canonical form', async () => {
  installApi()
  renderApp('?sort=-date&currency=XAU&status=PENDING&utm_source=mail')
  await screen.findByRole('table', { name: 'Transactions' })
  expect(location.search).toBe('?status=PENDING')
})
