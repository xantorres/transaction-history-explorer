import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { installApi, store } from './test/api-stub.ts'
import { field, fill, hrefAt, renderApp, waitForRows } from './test/app.tsx'

const firstId = (filters: Parameters<typeof store.list>[0]) =>
  store.list(filters, '-date', null, 100).items[0]?.id

test('fills every filter control from the URL', () => {
  installApi()
  renderApp(
    '?q=late+fee&from=2026-10-01&to=2026-10-31&tz=Asia/Tokyo&min=10&max=99.5&currency=EUR&status=PENDING&category=Fees',
  )
  expect(field('Search').value).toBe('late fee')
  expect(field('From').value).toBe('2026-10-01')
  expect(field('To').value).toBe('2026-10-31')
  expect(field('Min amount').value).toBe('10')
  expect(field('Max amount').value).toBe('99.5')
  expect(field('Currency').value).toBe('EUR')
  expect(field('Status').value).toBe('PENDING')
  expect(field('Category').value).toBe('Fees')
  expect(screen.getByRole('note').textContent).toContain('Asia/Tokyo')
})

test('debounces typing into one history entry per burst', async () => {
  installApi()
  renderApp()
  const entries = history.length
  fireEvent.focus(field('Search'))
  for (const value of ['k', 'ke', 'kes', 'kest']) {
    fireEvent.change(field('Search'), { target: { value } })
  }
  expect(location.search).toBe('')
  await waitFor(() => {
    expect(location.search).toBe('?q=kest')
  })
  fireEvent.change(field('Search'), { target: { value: 'kestrel ' } })
  await waitFor(() => {
    expect(location.search).toBe('?q=kestrel')
  })
  expect(history.length).toBe(entries + 1)
  expect(field('Search').value).toBe('kestrel ')
})

test('back and forward restore the filters and their rows', async () => {
  installApi()
  renderApp()
  await waitForRows()
  const entries = history.length
  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  fill('Search', 'kestrel')
  expect(location.search).toBe('?q=kestrel&currency=EUR')
  expect(history.length).toBe(entries + 2)
  const both = `?q=kestrel&currency=EUR&tx=${String(firstId({ q: 'kestrel', currency: 'EUR' }))}`
  await waitFor(() => {
    expect(hrefAt(2)).toBe(both)
  })

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(hrefAt(2)).toBe(`?currency=EUR&tx=${String(firstId({ currency: 'EUR' }))}`)
  })
  expect(field('Search').value).toBe('')
  expect(field('Currency').value).toBe('EUR')

  act(() => {
    history.forward()
  })
  await waitFor(() => {
    expect(hrefAt(2)).toBe(both)
  })
  expect(field('Search').value).toBe('kestrel')
})

test('typing after Back keeps the entry Back returned to', async () => {
  installApi()
  renderApp()
  fireEvent.focus(field('Search'))
  fireEvent.change(field('Search'), { target: { value: 'kestrel' } })
  await waitFor(() => {
    expect(location.search).toBe('?q=kestrel')
  })

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(field('Search').value).toBe('')
  })
  fireEvent.change(field('Search'), { target: { value: 'aegean' } })
  await waitFor(() => {
    expect(location.search).toBe('?q=aegean')
  })

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('')
  })
})

test('a slow earlier search never replaces a newer one', async () => {
  const api = installApi()
  const isSlow = (url: URL) =>
    url.pathname === '/api/transactions' && url.searchParams.get('q') === 'aegean'
  const release = api.hold(isSlow)
  renderApp()
  await waitForRows()
  fill('Search', 'aegean')
  await waitFor(() => {
    expect(api.requests.some(({ url }) => isSlow(url))).toBe(true)
  })
  fill('Search', 'kestrel')
  const newer = `?q=kestrel&tx=${String(firstId({ q: 'kestrel' }))}`
  await waitFor(() => {
    expect(hrefAt(2)).toBe(newer)
  })
  expect(api.requests.find(({ url }) => isSlow(url))?.signal.aborted).toBe(true)
  release()
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(hrefAt(2)).toBe(newer)
})

test('date filters send the viewer calendar days as UTC instants', async () => {
  const api = installApi()
  renderApp()
  fill('From', '2026-03-08')
  fill('To', '2026-03-08')
  expect(location.search).toBe('?from=2026-03-08&to=2026-03-08&tz=America/New_York')
  await waitFor(() => {
    const params = api.requests.at(-1)?.url.searchParams
    expect(params?.get('from')).toBe('2026-03-08T05:00:00.000Z')
    expect(params?.get('to')).toBe('2026-03-09T04:00:00.000Z')
  })
})

test('amount filters accept a decimal comma and flag garbage', () => {
  installApi()
  renderApp()
  fill('Min amount', '12,5')
  expect(location.search).toBe('?min=12.5')
  expect(field('Min amount').value).toBe('12,5')
  fill('Max amount', '12.5.5')
  expect(location.search).toBe('?min=12.5')
  expect(field('Max amount').getAttribute('aria-invalid')).toBe('true')
})

test('clearing filters keeps the sort order', () => {
  installApi()
  renderApp('?q=kestrel&currency=EUR&sort=amount')
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(location.search).toBe('?sort=amount')
  expect(field('Search').value).toBe('')
  expect(field('Currency').value).toBe('')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear filters' }).disabled).toBe(
    true,
  )
})
