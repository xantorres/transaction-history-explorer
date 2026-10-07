import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { installApi, store } from './test/api-stub.ts'
import { field, fill, hrefAt, renderApp, waitForRows } from './test/app.tsx'

const firstId = (filters: Parameters<typeof store.list>[0]) =>
  store.list(filters, '-date', null, 100).items[0]?.id

const problem = (label: string) => {
  const id = field(label).getAttribute('aria-describedby')
  return id ? document.getElementById(id)?.textContent : undefined
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

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

test('debounces typing into one history entry per burst', () => {
  installApi()
  renderApp()
  const entries = history.length
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.focus(field('Search'))
  for (const value of ['k', 'ke', 'kes', 'kest']) {
    fireEvent.change(field('Search'), { target: { value } })
  }
  advance(299)
  expect(location.search).toBe('')
  advance(1)
  expect(location.search).toBe('?q=kest')
  fireEvent.change(field('Search'), { target: { value: 'kestrel ' } })
  advance(300)
  expect(location.search).toBe('?q=kestrel')
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
  renderApp('?status=BOOKED')
  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  fireEvent.focus(field('Search'))
  fireEvent.change(field('Search'), { target: { value: 'kestrel' } })
  await waitFor(() => {
    expect(location.search).toBe('?q=kestrel&currency=EUR&status=BOOKED')
  })

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(field('Search').value).toBe('')
  })
  fireEvent.change(field('Search'), { target: { value: 'aegean' } })
  await waitFor(() => {
    expect(location.search).toBe('?q=aegean&currency=EUR&status=BOOKED')
  })

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('?currency=EUR&status=BOOKED')
  })
})

test('refocusing a field starts a new history entry', () => {
  installApi()
  renderApp()
  const entries = history.length
  fireEvent.focus(field('Search'))
  fill('Search', 'kestrel')
  fireEvent.focus(field('Search'))
  fill('Search', 'aegean')
  expect(history.length).toBe(entries + 2)
})

test('one visit to a select is one history entry, and Back starts another', async () => {
  installApi()
  renderApp('?status=BOOKED')
  const entries = history.length
  fireEvent.focus(field('Currency'))
  for (const value of ['EUR', 'GBP', 'USD']) {
    fireEvent.change(field('Currency'), { target: { value } })
  }
  expect(location.search).toBe('?currency=USD&status=BOOKED')
  expect(history.length).toBe(entries + 1)

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('?status=BOOKED')
  })
  fireEvent.change(field('Currency'), { target: { value: 'JPY' } })
  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('?status=BOOKED')
  })
})

test('waits for an IME composition to end before searching', () => {
  installApi()
  renderApp()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.compositionStart(field('Search'))
  fireEvent.change(field('Search'), { target: { value: 'とうきょう' } })
  fireEvent.keyDown(field('Search'), { key: 'Enter' })
  advance(300)
  expect(location.search).toBe('')
  fireEvent.change(field('Search'), { target: { value: '東京' } })
  fireEvent.compositionEnd(field('Search'))
  advance(300)
  expect(location.search).toBe(`?${new URLSearchParams({ q: '東京' }).toString()}`)
})

test('Clear filters drops a search still being typed', () => {
  installApi()
  renderApp('?q=kestrel')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.change(field('Search'), { target: { value: 'kestrel ae' } })
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  advance(300)
  expect(location.search).toBe('')
  expect(field('Search').value).toBe('')
})

test('abandons the request of a superseded search', async () => {
  const api = installApi()
  const isSlow = (url: URL) =>
    url.pathname === '/api/transactions' && url.searchParams.get('q') === 'aegean'
  api.hold(isSlow)
  renderApp()
  await waitForRows()
  fill('Search', 'aegean')
  await waitFor(() => {
    expect(api.requests.some(({ url }) => isSlow(url))).toBe(true)
  })
  fill('Search', 'kestrel')
  await waitFor(() => {
    expect(hrefAt(2)).toBe(`?q=kestrel&tx=${String(firstId({ q: 'kestrel' }))}`)
  })
  expect(api.requests.find(({ url }) => isSlow(url))?.signal.aborted).toBe(true)
})

test('a slow earlier search never replaces a newer one', async () => {
  installApi()
  const stubbed = fetch
  let release = () => {}
  const late = new Promise<void>((resolve) => {
    release = resolve
  })
  let stale: Promise<Response> | undefined
  // Without init the superseded request ignores its abort signal and answers after the newer rows.
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(path, location.origin)
    if (pathname !== '/api/transactions' || searchParams.get('q') !== 'aegean') {
      return stubbed(path, init)
    }
    stale = late.then(() => stubbed(path))
    return stale
  })
  renderApp()
  await waitForRows()
  fill('Search', 'aegean')
  await waitFor(() => {
    expect(stale).toBeDefined()
  })
  fill('Search', 'kestrel')
  const newer = `?q=kestrel&tx=${String(firstId({ q: 'kestrel' }))}`
  await waitFor(() => {
    expect(hrefAt(2)).toBe(newer)
  })
  release()
  await act(async () => {
    await stale
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  expect((await stale)?.bodyUsed).toBe(true)
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

test('the last day of the calendar can end the range', async () => {
  const api = installApi()
  renderApp('?to=9999-12-31')
  expect(field('From').getAttribute('max')).toBe('9999-12-31')
  expect(field('To').getAttribute('max')).toBe('9999-12-31')
  await waitForRows()
  expect(api.requests.at(-1)?.url.searchParams.get('to')).toBe('+010000-01-01T05:00:00.000Z')
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
  expect(problem('Max amount')).toBe('Not a number')
})

test('garbage in an amount keeps the bound already applied', () => {
  installApi()
  renderApp('?min=10')
  fill('Min amount', '10x')
  expect(location.search).toBe('?min=10')
  expect(field('Min amount').getAttribute('aria-invalid')).toBe('true')
  fill('Min amount', '12')
  expect(location.search).toBe('?min=12')
  expect(field('Min amount').getAttribute('aria-invalid')).toBeNull()
  expect(problem('Min amount')).toBeUndefined()
})

test('Clear filters also wipes amounts that could not apply', () => {
  installApi()
  renderApp('?min=10&currency=EUR')
  fill('Min amount', '10x')
  fill('Max amount', 'abc')
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(location.search).toBe('')
  for (const label of ['Min amount', 'Max amount']) {
    expect(field(label).value).toBe('')
    expect(field(label).getAttribute('aria-invalid')).toBeNull()
  }
})

test('Back replaces an amount that could not apply', async () => {
  installApi()
  renderApp()
  fill('Min amount', '10')
  fill('Min amount', '10x')
  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('')
  })
  expect(field('Min amount').value).toBe('')
  expect(field('Min amount').getAttribute('aria-invalid')).toBeNull()
})

test('a half-typed date keeps the day already applied until history moves on', async () => {
  installApi()
  renderApp()
  fill('From', '2026-03-01')
  const applied = location.search
  Object.defineProperty(field('From'), 'validity', { value: { badInput: true } })
  fill('From', '')
  expect(location.search).toBe(applied)
  expect(field('From').getAttribute('aria-invalid')).toBe('true')
  expect(problem('From')).toBe('Incomplete date')

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('')
  })
  expect(field('From').getAttribute('aria-invalid')).toBeNull()
})

test('flags a range whose ends are the wrong way round', () => {
  installApi()
  renderApp('?from=2026-03-10&to=2026-03-01&min=50&max=20')
  expect(problem('From')).toBe('Later than To')
  expect(problem('To')).toBe('Earlier than From')
  expect(problem('Min amount')).toBe('More than Max')
  expect(problem('Max amount')).toBe('Less than Min')
  fill('To', '2026-03-31')
  fill('Max amount', '50')
  for (const label of ['From', 'To', 'Min amount', 'Max amount']) {
    expect(field(label).getAttribute('aria-invalid')).toBeNull()
  }
})

test('clearing filters keeps the sort order and Back restores the filters', async () => {
  installApi()
  renderApp('?q=kestrel&currency=EUR&sort=amount')
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(location.search).toBe('?sort=amount')
  expect(field('Search').value).toBe('')
  expect(field('Currency').value).toBe('')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear filters' }).disabled).toBe(
    true,
  )

  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(location.search).toBe('?q=kestrel&currency=EUR&sort=amount')
  })
})
