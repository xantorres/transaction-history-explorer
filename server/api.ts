import { CATEGORIES, CURRENCIES, SORTS, STATUSES, type ApiErrorBody } from '../src/domain.ts'
import { DECIMAL } from '../src/money.ts'
import { CursorError, type Filters, type Store } from './store.ts'

interface ApiOptions {
  store: Store
  latency?: () => number
  simulateFaults?: boolean
}

const UTC_INSTANT = /^([+-]\d{6}|\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const MAX_LIMIT = 5000

class InvalidParam extends Error {
  param: string
  constructor(param: string, message: string) {
    super(message)
    this.param = param
  }
}

const error = (status: number, error: ApiErrorBody['error'], headers?: Record<string, string>) =>
  Response.json({ error } satisfies ApiErrorBody, { status, headers })

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason as Error)
      },
      { once: true },
    )
  })
}

function oneOf<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]) {
  const value = params.get(name) || undefined
  if (value === undefined || allowed.includes(value as T)) return value as T | undefined
  throw new InvalidParam(name, `${name} must be one of ${allowed.join(', ')}`)
}

function matching(params: URLSearchParams, name: string, pattern: RegExp, expected: string) {
  const value = params.get(name) || undefined
  if (value === undefined || pattern.test(value)) return value
  throw new InvalidParam(name, `${name} must be ${expected}`)
}

function parseFilters(params: URLSearchParams): Filters {
  const instant = (name: string) => {
    const value = matching(params, name, UTC_INSTANT, 'an ISO 8601 instant in UTC')
    if (value === undefined) return undefined
    const time = Date.parse(value)
    // Date.parse rolls February 30 over into March, so a real instant reads back unchanged.
    const seconds = value.replace(/(\.\d+)?Z$/, '')
    if (!Number.isNaN(time) && new Date(time).toISOString().startsWith(seconds)) return time
    throw new InvalidParam(name, `${name} must be a real date and time`)
  }
  return {
    q: params.get('q')?.trim() || undefined,
    from: instant('from'),
    to: instant('to'),
    min: matching(params, 'min', DECIMAL, 'a non-negative decimal'),
    max: matching(params, 'max', DECIMAL, 'a non-negative decimal'),
    currency: oneOf(params, 'currency', CURRENCIES),
    status: oneOf(params, 'status', STATUSES),
    category: oneOf(params, 'category', CATEGORIES),
  }
}

function parseLimit(params: URLSearchParams) {
  const limit = Number(matching(params, 'limit', /^\d+$/, 'a whole number') ?? 100)
  if (limit >= 1 && limit <= MAX_LIMIT) return limit
  throw new InvalidParam('limit', `limit must be between 1 and ${String(MAX_LIMIT)}`)
}

function faults(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const value = /(?:^|;\s*)faults=([^;]*)/.exec(cookie)?.[1] ?? ''
  return new Set(value.split(','))
}

type Endpoint = 'list' | 'page' | 'summary' | 'detail'

function endpointOf({ pathname, searchParams }: URL): Endpoint | undefined {
  if (pathname === '/api/transactions') return searchParams.has('cursor') ? 'page' : 'list'
  if (pathname === '/api/summary') return 'summary'
  if (/^\/api\/transactions\/[^/]+$/.test(pathname)) return 'detail'
  return undefined
}

function find(store: Store, pathname: string) {
  try {
    return store.get(decodeURIComponent(pathname.replace('/api/transactions/', '')))
  } catch {
    return undefined
  }
}

function respond(store: Store, endpoint: Endpoint, url: URL) {
  const params = url.searchParams
  try {
    if (endpoint === 'summary') return Response.json(store.summary(parseFilters(params)))
    if (endpoint === 'detail') {
      const transaction = find(store, url.pathname)
      if (transaction) return Response.json(transaction)
      return error(404, { code: 'not_found', message: 'No such transaction' })
    }
    const sort = oneOf(params, 'sort', SORTS) ?? '-date'
    const page = store.list(parseFilters(params), sort, params.get('cursor'), parseLimit(params))
    return Response.json(page)
  } catch (reason) {
    if (reason instanceof InvalidParam) {
      return error(400, { code: 'invalid_param', message: reason.message, param: reason.param })
    }
    if (reason instanceof CursorError) {
      return error(400, { code: 'invalid_cursor', message: reason.message, param: 'cursor' })
    }
    throw reason
  }
}

export function createApi({
  store,
  latency = () => 200 + Math.random() * 600,
  simulateFaults = false,
}: ApiOptions) {
  return async (request: Request): Promise<Response> => {
    await sleep(latency(), request.signal)
    const url = new URL(request.url)
    const endpoint = endpointOf(url)
    if (!endpoint) return error(404, { code: 'not_found', message: 'No such endpoint' })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const message = 'Only GET and HEAD are supported'
      return error(405, { code: 'method_not_allowed', message }, { allow: 'GET, HEAD' })
    }
    const response =
      simulateFaults && faults(request).has(endpoint)
        ? error(500, { code: 'injected_fault', message: `Simulated ${endpoint} failure` })
        : respond(store, endpoint, url)
    if (request.method === 'GET') return response
    return new Response(null, { status: response.status, headers: response.headers })
  }
}
