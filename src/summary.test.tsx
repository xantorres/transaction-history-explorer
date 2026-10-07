import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { formatMoney } from './money.ts'
import { installApi, store } from './test/api-stub.ts'
import { dataRows, renderApp, waitForRows } from './test/app.tsx'

const summary = () => within(screen.getByRole('region', { name: 'Summary' }))

test('counts every match on the server, not just the loaded rows', async () => {
  installApi()
  renderApp()
  await summary().findByText('1,000')
  expect(dataRows().length).toBeLessThan(100)
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('1001')
})

test('totals money in, out and pending per currency', async () => {
  installApi()
  renderApp()
  const { count, perCurrency } = store.summary({})
  await summary().findByText(count.toLocaleString('en-US'))
  expect(perCurrency.length).toBeGreaterThan(1)
  for (const { currency, in: incoming, out, pending } of perCurrency) {
    const stat = summary().getByText(currency).parentElement as HTMLElement
    expect(
      within(stat)
        .getAllByRole('definition')
        .map((cell) => cell.textContent),
    ).toEqual([
      `In ${formatMoney(incoming, currency)}`,
      `Out ${formatMoney(out, currency)}`,
      `Pending ${formatMoney(pending, currency)}`,
    ])
  }
})

test('keeps the table usable when only the summary fails', async () => {
  installApi()
  document.cookie = 'faults=summary'
  renderApp()
  await waitForRows()
  await summary().findByText("Couldn't load totals.")
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('-1')

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(summary().getByRole('button', { name: 'Retry' }))
  await summary().findByText('1,000')
})
