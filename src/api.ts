import {
  QueryClient,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { nextDay, zonedDayStart } from './dates.ts'
import type { ApiErrorBody, Page, Sort, Summary, Transaction } from './domain.ts'
import type { View } from './url-state.ts'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal })
  if (response.ok) return response.json()
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>
  throw new ApiError(response.status, body.error?.message ?? response.statusText)
}

function toQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) if (value) query.set(name, value)
  return query.toString()
}

const utcDayStart = (date: string, timeZone: string) =>
  new Date(zonedDayStart(date, timeZone)).toISOString()

export type Filters = ReturnType<typeof toFilters>

export function toFilters({ q, from, to, tz, min, max, currency, status, category }: View) {
  return {
    q,
    from: from && utcDayStart(from, tz),
    to: to && utcDayStart(nextDay(to), tz),
    min,
    max,
    currency,
    status,
    category,
  }
}

type PageQuery = Filters & { sort: Sort; cursor: string; limit?: string }

export const fetchPage = (query: PageQuery, signal: AbortSignal) =>
  getJson(`/api/transactions?${toQuery(query)}`, signal) as Promise<Page>

export const transactionsQuery = (filters: Filters, sort: Sort) =>
  infiniteQueryOptions({
    queryKey: ['transactions', filters, sort],
    queryFn: ({ pageParam, signal }) => fetchPage({ ...filters, sort, cursor: pageParam }, signal),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  })

export const summaryQuery = (filters: Filters) =>
  queryOptions({
    queryKey: ['summary', filters],
    queryFn: ({ signal }) =>
      getJson(`/api/summary?${toQuery(filters)}`, signal) as Promise<Summary>,
    placeholderData: keepPreviousData,
  })

export const transactionQuery = (id: string, client: QueryClient) =>
  queryOptions<Transaction>({
    queryKey: ['transaction', id],
    queryFn: ({ signal }) =>
      getJson(`/api/transactions/${encodeURIComponent(id)}`, signal) as Promise<Transaction>,
    initialData: () =>
      client
        .getQueriesData<InfiniteData<Page>>({ queryKey: ['transactions'] })
        .flatMap(([, data]) => data?.pages ?? [])
        .flatMap((page) => page.items)
        .find((row) => row.id === id),
    // The list's copy shows at once and stays if the fetch fails, but never counts as fresh.
    initialDataUpdatedAt: 0,
  })

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status < 500),
      },
    },
  })
