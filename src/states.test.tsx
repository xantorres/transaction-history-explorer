import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ROW_HEIGHT } from './components/TransactionTable.tsx'
import { installApi } from './test/api-stub.ts'
import { dataRows, hrefAt, renderApp, rowAt, waitForRows } from './test/app.tsx'

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
  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 90 * ROW_HEIGHT } })
  await table().findByText("Couldn't load more.")
  expect(rowAt(101)).toBeDefined()
  const pages = api.requests.filter(({ url }) => url.searchParams.has('cursor')).length

  fireEvent.scroll(body as HTMLElement, { target: { scrollTop: 91 * ROW_HEIGHT } })
  expect(api.requests.filter(({ url }) => url.searchParams.has('cursor'))).toHaveLength(pages)

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(table().getByRole('button', { name: 'Retry' }))
  await waitFor(() => {
    expect(hrefAt(102)).toBeTruthy()
  })
})
