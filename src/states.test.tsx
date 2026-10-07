import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ROW_HEIGHT } from './components/TransactionTable.tsx'
import { installApi } from './test/api-stub.ts'
import { dataRows, field, hrefAt, renderApp, rowAt, waitForRows } from './test/app.tsx'

const table = () => within(screen.getByRole('table', { name: 'Transactions' }))

test('offers a way out of an empty result', async () => {
  installApi()
  renderApp('?q=no-such-counterparty&currency=EUR&sort=amount')
  await table().findByText('No transactions match these filters.')
  expect(dataRows()).toHaveLength(0)

  fireEvent.click(table().getByRole('button', { name: 'Clear filters' }))
  expect(location.search).toBe('?sort=amount')
  await waitForRows()
  expect(table().queryByText('No transactions match these filters.')).toBeNull()
})

test('a failed list can be retried in place', async () => {
  installApi()
  document.cookie = 'faults=list'
  renderApp()
  await table().findByText("Couldn't load transactions.")
  expect(table().queryByText('No transactions match these filters.')).toBeNull()

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(table().getByRole('button', { name: 'Retry' }))
  await waitForRows()
  expect(table().queryByText("Couldn't load transactions.")).toBeNull()
})

test('a failed next page keeps the loaded rows and retries inline', async () => {
  const api = installApi()
  document.cookie = 'faults=page'
  renderApp()
  await waitForRows()
  const [, body] = screen.getAllByRole('rowgroup')
  const pages = () => api.requests.filter(({ url }) => url.searchParams.has('cursor')).length
  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 90 * ROW_HEIGHT } })
  await table().findByText("Couldn't load more.")
  expect(rowAt(101)).toBeDefined()
  const failed = pages()

  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  expect(pages()).toBe(failed)
  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 91 * ROW_HEIGHT } })
  expect(pages()).toBe(failed)

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(table().getByRole('button', { name: 'Retry' }))
  await waitFor(() => {
    expect(hrefAt(102)).toBeTruthy()
  })
})

test('the development panel simulates failures until switched off', async () => {
  installApi()
  renderApp()
  await waitForRows()

  fireEvent.click(screen.getByRole('checkbox', { name: 'Summary' }))
  expect(document.cookie).toBe('faults=summary')
  await within(screen.getByRole('region', { name: 'Summary' })).findByText("Couldn't load totals.")

  fireEvent.click(screen.getByRole('checkbox', { name: 'Summary' }))
  expect(document.cookie).toBe('faults=')
})

test('keeps the previous rows and totals in place while a new result loads', async () => {
  const api = installApi()
  renderApp()
  await waitForRows()
  const transactions = screen.getByRole('table', { name: 'Transactions' })
  const totals = screen.getByRole('region', { name: 'Summary' })
  await within(totals).findByText('1,000')
  const before = rowAt(2)?.textContent

  api.hold((url) => url.searchParams.get('currency') === 'EUR')
  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  expect(rowAt(2)?.textContent).toBe(before)
  expect(transactions.getAttribute('data-stale')).toBe('true')
  expect(totals.getAttribute('data-stale')).toBe('true')
  expect(transactions.querySelector('.skeleton')).toBeNull()
  expect(totals.querySelector('.skeleton')).toBeNull()
  expect(within(totals).getByText('1,000')).toBeDefined()
})

test('marks the first load as busy and shows skeletons until it arrives', async () => {
  const api = installApi()
  const release = api.hold(() => true)
  renderApp()
  const transactions = screen.getByRole('table', { name: 'Transactions' })
  const totals = screen.getByRole('region', { name: 'Summary' })
  expect(transactions.getAttribute('aria-busy')).toBe('true')
  expect(transactions.querySelector('.skeleton')).not.toBeNull()
  expect(totals.getAttribute('aria-busy')).toBe('true')
  expect(totals.querySelector('.skeleton')).not.toBeNull()

  release()
  await waitForRows()
  await within(totals).findByText('1,000')
  expect(transactions.getAttribute('aria-busy')).toBe('false')
  expect(totals.getAttribute('aria-busy')).toBe('false')
  expect(transactions.querySelector('.skeleton')).toBeNull()
  expect(totals.querySelector('.skeleton')).toBeNull()
})
