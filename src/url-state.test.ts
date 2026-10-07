import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { decodeView, encodeView, updateView, useView } from './url-state.ts'

const VIEWER = 'America/New_York'
const canonical = (search: string) => encodeView(decodeView(search, VIEWER))

describe('view codec', () => {
  test('decodes typed values and fills defaults', () => {
    expect(decodeView('', VIEWER)).toEqual({ tz: VIEWER, sort: '-date' })
    expect(decodeView('?currency=JPY&min=100&tx=tx_0aa3beec', VIEWER)).toEqual({
      tz: VIEWER,
      sort: '-date',
      currency: 'JPY',
      min: '100',
      tx: 'tx_0aa3beec',
    })
  })

  test('writes params in one canonical order', () => {
    expect(
      canonical(
        '?tx=tx_1&sort=amount&category=Fees&status=PENDING&currency=EUR&max=20&min=10.5' +
          '&tz=Asia/Tokyo&to=2026-02-01&from=2026-01-01&q=rent',
      ),
    ).toBe(
      '?q=rent&from=2026-01-01&to=2026-02-01&tz=Asia/Tokyo&min=10.5&max=20' +
        '&currency=EUR&status=PENDING&category=Fees&sort=amount&tx=tx_1',
    )
  })

  test('omits defaults and empty values', () => {
    expect(canonical('?sort=-date&q=&currency=&min=&tx=')).toBe('')
    expect(canonical('?q=%20%20late+fee%20')).toBe('?q=late+fee')
  })

  test('drops values it cannot use', () => {
    expect(
      canonical(
        '?currency=XAU&status=booked&category=Gifts&sort=payee&min=-5&max=1e3' +
          '&from=2026-02-30&to=soon&utm_source=mail',
      ),
    ).toBe('')
  })

  test('pins date filters to a time zone', () => {
    expect(canonical('?from=2026-01-01')).toBe('?from=2026-01-01&tz=America/New_York')
    expect(canonical('?to=2026-01-31&tz=asia/tokyo')).toBe('?to=2026-01-31&tz=Asia/Tokyo')
    expect(canonical('?from=2026-01-01&tz=Mars/Olympus')).toBe(
      '?from=2026-01-01&tz=America/New_York',
    )
    expect(canonical('?tz=Asia/Tokyo')).toBe('')
  })

  test('keeps inverted ranges so the server can answer with no rows', () => {
    expect(canonical('?from=2026-02-01&to=2026-01-01&min=50&max=10')).toBe(
      '?from=2026-02-01&to=2026-01-01&tz=America/New_York&min=50&max=10',
    )
  })
})

describe('view store', () => {
  test('pushes a canonical entry and re-renders subscribers', () => {
    const { result } = renderHook(() => useView())
    const entries = history.length
    act(() => {
      updateView({ currency: 'GBP', q: ' rent ' }, 'push')
    })
    expect(location.search).toBe('?q=rent&currency=GBP')
    expect(history.length).toBe(entries + 1)
    expect(result.current).toMatchObject({ q: 'rent', currency: 'GBP' })
  })

  test('replaces in place and ignores no-op updates', () => {
    const entries = history.length
    updateView({ q: 'rent' }, 'replace')
    updateView({ q: 'rent ' }, 'push')
    updateView({ sort: '-date' }, 'push')
    expect(location.search).toBe('?q=rent')
    expect(history.length).toBe(entries)
  })

  test('clears a param when the patch value is empty', () => {
    updateView({ q: 'rent', status: 'BOOKED' }, 'replace')
    updateView({ q: '', status: undefined }, 'replace')
    expect(location.search).toBe('')
  })

  test('follows back and forward', async () => {
    const { result } = renderHook(() => useView())
    act(() => {
      updateView({ status: 'BOOKED' }, 'push')
    })
    history.back()
    await waitFor(() => {
      expect(result.current.status).toBeUndefined()
    })
    history.forward()
    await waitFor(() => {
      expect(result.current.status).toBe('BOOKED')
    })
  })
})
