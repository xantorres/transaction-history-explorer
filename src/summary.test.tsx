import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { formatMoney } from './money.ts'
import { installApi, store } from './test/api-stub.ts'
import { dataRows, renderApp, waitForRows } from './test/app.tsx'

const summary = () => within(screen.getByRole('region', { name: 'Summary' }))

test('counts every match on the server, not just the loaded rows', async () => {
  installApi()
  renderApp()
  await waitFor(() => {
    expect(summary().getByText('1,000')).toBeDefined()
  })
  expect(dataRows().length).toBeLessThan(100)
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('1001')
})

test('totals money in, out and pending per currency', async () => {
  installApi()
  renderApp('?category=Fees')
  const { count, perCurrency } = store.summary({ category: 'Fees' })
  await waitFor(() => {
    expect(summary().getByText(count.toLocaleString('en-US'))).toBeDefined()
  })
  expect(perCurrency.length).toBeGreaterThan(1)
  for (const { currency, in: incoming, out, pending } of perCurrency) {
    const totals = summary().getByText(currency).parentElement?.textContent
    expect(totals).toContain(formatMoney(incoming, currency))
    expect(totals).toContain(formatMoney(out, currency))
    expect(totals).toContain(formatMoney(pending, currency))
  }
})

test('keeps the table usable when only the summary fails', async () => {
  installApi()
  document.cookie = 'faults=summary'
  renderApp()
  await waitForRows()
  await waitFor(() => {
    expect(summary().getByText("Couldn't load totals.")).toBeDefined()
  })
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('-1')

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(summary().getByRole('button', { name: 'Retry' }))
  await waitFor(() => {
    expect(summary().getByText('1,000')).toBeDefined()
  })
})
