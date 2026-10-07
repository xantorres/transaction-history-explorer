import { CATEGORIES, CURRENCIES, SORTS, STATUSES, type ApiErrorBody } from '../src/domain.ts'
import { CursorError, type Filters, type Store } from './store.ts'

interface ApiOptions {
  store: Store
  latency?: () => number
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const DECIMAL = /^\d+(\.\d+)?$/
const MAX_LIMIT = 5000

class InvalidParam extends Error {
  param: string
  constructor(param: string, message: string) {
    super(message)
    this.param = param
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const error = (status: number, error: ApiErrorBody['error']) =>
  json(status, { error } satisfies ApiErrorBody)

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
    return value === undefined ? undefined : Date.parse(value)
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

const PREFIX = '/api/transactions'

type Endpoint = 'list' | 'page' | 'summary' | 'detail'

function endpointOf({ pathname, searchParams }: URL): Endpoint | undefined {
  if (pathname === PREFIX) return searchParams.has('cursor') ? 'page' : 'list'
  if (pathname === `${PREFIX}/summary`) return 'summary'
  if (/^\/api\/transactions\/[^/]+$/.test(pathname)) return 'detail'
  return undefined
}

function respond(store: Store, endpoint: Endpoint, url: URL) {
  const params = url.searchParams
  try {
    if (endpoint === 'summary') return json(200, store.summary(parseFilters(params)))
    if (endpoint === 'detail') {
      const transaction = store.get(url.pathname.slice(PREFIX.length + 1))
      if (transaction) return json(200, transaction)
      return error(404, { code: 'not_found', message: 'No such transaction' })
    }
    const sort = oneOf(params, 'sort', SORTS) ?? '-date'
    const page = store.list(parseFilters(params), sort, params.get('cursor'), parseLimit(params))
    return json(200, page)
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

export function createApi({ store, latency = () => 200 + Math.random() * 600 }: ApiOptions) {
  return async (request: Request): Promise<Response> => {
    await sleep(latency(), request.signal)
    if (request.method !== 'GET') {
      return error(405, { code: 'method_not_allowed', message: 'Only GET is supported' })
    }
    const url = new URL(request.url)
    const endpoint = endpointOf(url)
    if (!endpoint) return error(404, { code: 'not_found', message: 'No such endpoint' })
    if (faults(request).has(endpoint)) {
      return error(500, { code: 'injected_fault', message: `Simulated ${endpoint} failure` })
    }
    return respond(store, endpoint, url)
  }
}
