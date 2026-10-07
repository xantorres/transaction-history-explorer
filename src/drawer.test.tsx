import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { Status } from './domain.ts'
import { formatMoney } from './money.ts'
import { installApi, store } from './test/api-stub.ts'
import { renderApp, rowAt, waitForRows } from './test/app.tsx'

const all = store.list({}, '-date', null, 1000).items
const [first] = all
const unloaded = all.at(-1)
const drawer = () => screen.getByRole('dialog')
const drawerFor = (counterparty = '') => screen.getByRole('dialog', { name: counterparty })
const openFirstRow = () => {
  fireEvent.click(within(rowAt(2) as HTMLElement).getByRole('link'))
}
const drag = (from: Element, to: Element) => {
  fireEvent.pointerDown(from)
  fireEvent.pointerUp(to)
  // The click goes to the closest element both ends share.
  fireEvent.click(drawer())
}

test.each([
  [
    'the close button',
    () => {
      fireEvent.click(within(drawer()).getByRole('button', { name: 'Close' }))
    },
  ],
  [
    'Escape',
    () => {
      fireEvent(drawer(), new Event('cancel', { cancelable: true }))
    },
  ],
  [
    'the backdrop',
    () => {
      drag(drawer(), drawer())
    },
  ],
])('%s closes a shared link in place', async (_, close) => {
  installApi()
  renderApp(`?currency=EUR&tx=${String(unloaded?.id)}`)
  const entries = history.length
  await waitFor(() => {
    expect(drawerFor(unloaded?.counterparty).textContent).toContain(
      formatMoney(unloaded?.amount ?? 0, unloaded?.currency ?? 'EUR'),
    )
  })
  close()
  expect(location.search).toBe('?currency=EUR')
  expect(history.length).toBe(entries)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test.each([
  [
    'inside and ends on the backdrop',
    (inside: Element) => {
      drag(inside, drawer())
    },
  ],
  [
    'on the backdrop and ends inside',
    (inside: Element) => {
      drag(drawer(), inside)
    },
  ],
])('a drag that starts %s keeps the drawer open', async (_, dragOver) => {
  installApi()
  const search = `?tx=${String(unloaded?.id)}`
  renderApp(search)
  dragOver(await within(drawer()).findByRole('heading', { name: unloaded?.counterparty }))
  expect(location.search).toBe(search)
  expect(screen.queryByRole('dialog')).not.toBeNull()
})

test('a row opens instantly from the list cache and Back closes it', async () => {
  const api = installApi()
  renderApp()
  await waitForRows()
  const entries = history.length
  const release = api.hold((url) => url.pathname === `/api/transactions/${String(first?.id)}`)
  openFirstRow()
  expect(location.search).toBe(`?tx=${String(first?.id)}`)
  expect(history.length).toBe(entries + 1)
  expect(drawerFor(first?.counterparty)).toBeDefined()
  release()
  act(() => {
    history.back()
  })
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  expect(location.search).toBe('')
})

test('closing a row steps back, so Forward reopens it', async () => {
  installApi()
  renderApp()
  await waitForRows()
  openFirstRow()
  fireEvent.click(within(drawer()).getByRole('button', { name: 'Close' }))
  await waitFor(() => {
    expect(location.search).toBe('')
  })
  act(() => {
    history.forward()
  })
  await waitFor(() => {
    expect(drawerFor(first?.counterparty)).toBeDefined()
  })
})

test('closing twice before Back lands steps back once', async () => {
  installApi()
  renderApp()
  await waitForRows()
  openFirstRow()
  const back = vi.spyOn(history, 'back')
  const close = within(drawer()).getByRole('button', { name: 'Close' })
  fireEvent.click(close)
  fireEvent.click(close)
  expect(back).toHaveBeenCalledTimes(1)
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  expect(location.search).toBe('')
})

test.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])(
  'a click with %s keeps the browser new-tab behaviour',
  async (modifier) => {
    installApi()
    renderApp()
    await waitForRows()
    let prevented: boolean | undefined
    window.addEventListener(
      'click',
      (event) => {
        prevented = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    fireEvent.click(within(rowAt(2) as HTMLElement).getByRole('link'), { [modifier]: true })
    expect(prevented).toBe(false)
    expect(location.search).toBe('')
  },
)

test.each(['tx_00000000', 'summary'])('?tx=%s says the transaction was not found', async (id) => {
  const api = installApi()
  renderApp(`?tx=${id}`)
  await waitFor(() => {
    expect(drawerFor('Transaction not found')).toBeDefined()
  })
  const detail = api.requests.filter(({ url }) => url.pathname === `/api/transactions/${id}`)
  expect(detail).toHaveLength(1)
})

test('a failed detail request can be retried', async () => {
  installApi()
  document.cookie = 'faults=detail'
  renderApp(`?tx=${String(unloaded?.id)}`)
  await within(drawer()).findByText("Couldn't load this transaction.")
  document.cookie = 'faults=; max-age=0'
  fireEvent.click(within(drawer()).getByRole('button', { name: 'Retry' }))
  await waitFor(() => {
    expect(drawerFor(unloaded?.counterparty)).toBeDefined()
  })
})

test.each<[Status, RegExp | null]>([
  ['PENDING', /not booked yet/i],
  ['REVERSED', /returned/i],
  ['BOOKED', null],
])('%s transactions say how they count', async (status, note) => {
  installApi()
  const row = all.find((transaction) => transaction.status === status)
  renderApp(`?tx=${String(row?.id)}`)
  await waitFor(() => {
    expect(drawerFor(row?.counterparty).querySelector(`[data-status=${status}]`)).not.toBeNull()
  })
  const text = drawer().textContent
  if (note) expect(text).toMatch(note)
  else expect(text).not.toMatch(/not booked yet|returned/i)
})
