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
  expect((await summary().findByRole('alert')).textContent).toBe("Couldn't load totals.")
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('-1')

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(summary().getByRole('button', { name: 'Retry' }))
  expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Summary' }))
  await summary().findByText('1,000')
})

test('announces a new match count together with its label', async () => {
  installApi()
  renderApp()
  const live = (await summary().findByText('1,000')).closest('[aria-live]') as HTMLElement
  expect(live.getAttribute('aria-live')).toBe('polite')
  expect(live.getAttribute('aria-atomic')).toBe('true')
  expect(within(live).getByText('Transactions')).toBeDefined()
})

test('a keyboard can reach the totals to scroll them on a narrow screen', () => {
  installApi()
  renderApp()
  expect(screen.getByRole('region', { name: 'Summary' }).tabIndex).toBe(0)
})
