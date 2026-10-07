import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { transactionsQuery, type Filters } from '../api.ts'
import { formatDateTime } from '../dates.ts'
import type { Sort, Transaction } from '../domain.ts'
import { formatMoney } from '../money.ts'
import { clearFilters, encodeView, openTransaction, updateView, type View } from '../url-state.ts'
import { StatusBadge } from './StatusBadge.tsx'

export const ROW_HEIGHT = 44
const PREFETCH_ROWS = 20
const COLUMNS = ['date', 'counterparty', 'description', 'category', 'status', 'amount']

interface TransactionTableProps {
  view: View
  filters: Filters
  total?: number
}

export function TransactionTable({ view, filters, total }: TransactionTableProps) {
  const table = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const {
    data,
    isPending,
    isError,
    isFetching,
    isFetchingNextPage,
    isPlaceholderData,
    hasNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(transactionsQuery(filters, view.sort))
  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  const virtualizer = useVirtualizer({
    count: rows.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const items = virtualizer.getVirtualItems()
  const lastIndex = items.at(-1)?.index ?? -1

  useEffect(() => {
    if (
      lastIndex >= rows.length - PREFETCH_ROWS &&
      hasNextPage &&
      !isFetching &&
      !isFetchNextPageError
    ) {
      void fetchNextPage()
    }
  }, [lastIndex, rows.length, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage])

  const resultKey = JSON.stringify([filters, view.sort])
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [resultKey])

  return (
    <div
      ref={table}
      className="table"
      role="table"
      aria-label="Transactions"
      aria-rowcount={total === undefined || rows.length === 0 ? -1 : total + 1}
      aria-busy={isFetching}
      data-stale={isPlaceholderData || undefined}
      tabIndex={-1}
    >
      <div className="progress" hidden={!isFetching || isFetchingNextPage} />
      <div role="rowgroup" className="table-head">
        <div role="row" aria-rowindex={1} className="row">
          <SortHeader column="date" sort={view.sort}>
            Date
          </SortHeader>
          <div role="columnheader">Counterparty</div>
          <div role="columnheader" data-column="description">
            Description
          </div>
          <div role="columnheader" data-column="category">
            Category
          </div>
          <div role="columnheader" data-column="status">
            Status
          </div>
          <SortHeader column="amount" sort={view.sort}>
            Amount
          </SortHeader>
        </div>
      </div>
      <div ref={scroller} role="rowgroup" className="table-body">
        <div className="rows" style={{ height: virtualizer.getTotalSize() }}>
          {items.map(({ index, start }) => {
            const row = rows[index]
            const style = { height: ROW_HEIGHT, transform: `translateY(${String(start)}px)` }
            return row ? (
              <TransactionRow
                key={row.id}
                row={row}
                rowIndex={index + 2}
                view={view}
                style={style}
              />
            ) : (
              <div key="more" role="row" className="row" style={style}>
                <div role="cell" className="more">
                  {isFetchNextPageError ? (
                    <>
                      <span role="alert">Couldn't load more.</span>
                      <button
                        type="button"
                        disabled={isFetchingNextPage}
                        onClick={() => {
                          // This row gives way to new ones, so focus waits on the last loaded row.
                          scroller.current
                            ?.querySelector<HTMLElement>(
                              `[aria-rowindex="${String(rows.length + 1)}"] a`,
                            )
                            ?.focus()
                          void fetchNextPage()
                        }}
                      >
                        Retry
                      </button>
                    </>
                  ) : (
                    'Loading more…'
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {isPending && <Skeleton />}
        {isError && !data && (
          <Notice>
            <span role="alert">Couldn't load transactions.</span>
            <button
              type="button"
              disabled={isFetching}
              onClick={() => {
                table.current?.focus()
                void refetch()
              }}
            >
              Retry
            </button>
          </Notice>
        )}
        {data && rows.length === 0 && (
          <Notice>
            No transactions match these filters.
            <button
              type="button"
              onClick={() => {
                table.current?.focus()
                clearFilters(view)
              }}
            >
              Clear filters
            </button>
          </Notice>
        )}
      </div>
    </div>
  )
}

interface SortHeaderProps {
  column: 'date' | 'amount'
  sort: Sort
  children: string
}

function SortHeader({ column, sort, children }: SortHeaderProps) {
  const active = sort.endsWith(column)
  const descending = sort.startsWith('-')
  const next: Sort = active && descending ? column : `-${column}`
  return (
    <div
      role="columnheader"
      aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
      data-column={column}
    >
      <button
        type="button"
        onClick={() => {
          updateView({ sort: next }, 'push')
        }}
      >
        {children}
      </button>
    </div>
  )
}

interface TransactionRowProps {
  row: Transaction
  rowIndex: number
  view: View
  style: CSSProperties
}

function TransactionRow({ row, rowIndex, view, style }: TransactionRowProps) {
  return (
    <div role="row" aria-rowindex={rowIndex} className="row" data-status={row.status} style={style}>
      <div role="cell" data-column="date">
        <time dateTime={row.timestamp}>{formatDateTime(row.timestamp)}</time>
      </div>
      <div role="cell">
        <a
          href={encodeView({ ...view, tx: row.id })}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            openTransaction(row.id)
          }}
        >
          {row.counterparty}
        </a>
      </div>
      <div role="cell" data-column="description">
        {row.description}
      </div>
      <div role="cell" data-column="category">
        {row.category}
      </div>
      <div role="cell" data-column="status">
        <StatusBadge status={row.status} />
      </div>
      <div role="cell" data-column="amount" data-direction={row.amount > 0 ? 'in' : 'out'}>
        {formatMoney(row.amount, row.currency)}
      </div>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="notice">
      <div role="cell">{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="row" style={{ height: ROW_HEIGHT }}>
          {COLUMNS.map((column) => (
            <span key={column} data-column={column} />
          ))}
        </div>
      ))}
    </div>
  )
}
