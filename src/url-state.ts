import { useMemo, useSyncExternalStore } from 'react'
import { canonicalZone, isIsoDate, viewerZone } from './dates.ts'
import { CATEGORIES, CURRENCIES, SORTS, STATUSES } from './domain.ts'
import type { Category, Currency, Sort, Status } from './domain.ts'
import { DECIMAL } from './money.ts'

const PARAMS = [
  'q',
  'from',
  'to',
  'tz',
  'min',
  'max',
  'currency',
  'status',
  'category',
  'sort',
  'tx',
] as const
type Param = (typeof PARAMS)[number]

const DEFAULT_SORT: Sort = '-date'

export interface View {
  q?: string
  from?: string
  to?: string
  tz: string
  min?: string
  max?: string
  currency?: Currency
  status?: Status
  category?: Category
  sort: Sort
  tx?: string
}

export function decodeView(search: string, viewerTimeZone: string): View {
  const params = new URLSearchParams(search)
  const text = (name: Param) => params.get(name)?.trim() || undefined
  const valid = (name: Param, accepts: (value: string) => boolean) => {
    const value = text(name)
    return value !== undefined && accepts(value) ? value : undefined
  }
  const oneOf = <T extends string>(name: Param, options: readonly T[]) =>
    options.find((option) => option === params.get(name))
  const from = valid('from', isIsoDate)
  const to = valid('to', isIsoDate)
  const zone = from || to ? canonicalZone(params.get('tz') ?? '') : undefined
  return {
    q: text('q'),
    from,
    to,
    tz: zone ?? viewerTimeZone,
    min: valid('min', (value) => DECIMAL.test(value)),
    max: valid('max', (value) => DECIMAL.test(value)),
    currency: oneOf('currency', CURRENCIES),
    status: oneOf('status', STATUSES),
    category: oneOf('category', CATEGORIES),
    sort: oneOf('sort', SORTS) ?? DEFAULT_SORT,
    tx: text('tx'),
  }
}

export function encodeView({ tz, sort, ...view }: View) {
  const values = {
    ...view,
    tz: view.from || view.to ? tz : undefined,
    sort: sort === DEFAULT_SORT ? undefined : sort,
  }
  const params = new URLSearchParams()
  for (const name of PARAMS) {
    const value = values[name]
    if (value) params.set(name, value)
  }
  const search = params.toString().replaceAll('%2F', '/')
  return search && `?${search}`
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function useView() {
  const search = useSyncExternalStore(subscribe, () => location.search)
  return useMemo(() => decodeView(search, viewerZone), [search])
}

function navigate(search: string, mode: 'push' | 'replace', state?: unknown) {
  if (search === location.search) return
  const url = new URL(location.href)
  url.search = search
  if (mode === 'push') history.pushState(state, '', url)
  else history.replaceState(history.state, '', url)
  for (const listener of listeners) listener()
}

export function updateView(
  patch: Partial<Record<Param, string>>,
  mode: 'push' | 'replace',
  state?: unknown,
) {
  const params = new URLSearchParams(location.search)
  for (const [name, value] of Object.entries(patch)) {
    if (value) params.set(name, value)
    else params.delete(name)
  }
  navigate(encodeView(decodeView(params.toString(), viewerZone)), mode, state)
}

let clears = 0

export function clearFilters({ tz, sort }: View) {
  clears++
  navigate(encodeView({ tz, sort }), 'push')
}

export const useClears = () => useSyncExternalStore(subscribe, () => clears)

export function openTransaction(tx: string) {
  updateView({ tx }, 'push', { drawer: true })
}

let leaving = false

export function closeTransaction() {
  // Only a drawer opened from a row owns the entry below; Back on a shared link would leave the app.
  if (!(history.state as { drawer?: boolean } | null)?.drawer) updateView({ tx: '' }, 'replace')
  // Until Back lands this is still the drawer's entry, so a second close would step back twice.
  else if (!leaving) {
    leaving = true
    window.addEventListener(
      'popstate',
      () => {
        leaving = false
      },
      { once: true },
    )
    history.back()
  }
}

export function canonicalizeUrl() {
  navigate(encodeView(decodeView(location.search, viewerZone)), 'replace')
}
