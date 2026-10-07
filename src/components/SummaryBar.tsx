import type { UseQueryResult } from '@tanstack/react-query'
import { useRef } from 'react'
import type { CurrencyTotals, Summary } from '../domain.ts'
import { formatMoney } from '../money.ts'

export function SummaryBar({ summary }: { summary: UseQueryResult<Summary> }) {
  const { data, isError, isFetching, isPlaceholderData, refetch } = summary
  const section = useRef<HTMLElement>(null)

  return (
    <section
      ref={section}
      className="summary"
      aria-label="Summary"
      aria-busy={isFetching}
      data-stale={isPlaceholderData || undefined}
      // Lets a keyboard scroll the totals when they overflow a narrow screen.
      tabIndex={0}
    >
      {isError ? (
        <p className="summary-error">
          <span role="alert">Couldn't load totals.</span>
          <button
            type="button"
            disabled={isFetching}
            onClick={() => {
              section.current?.focus()
              void refetch()
            }}
          >
            Retry
          </button>
        </p>
      ) : data ? (
        <dl>
          <div className="stat" aria-live="polite" aria-atomic="true">
            <dt>Transactions</dt>
            <dd className="count">{data.count.toLocaleString(navigator.language)}</dd>
          </div>
          {data.perCurrency.map((totals) => (
            <Totals key={totals.currency} {...totals} />
          ))}
        </dl>
      ) : (
        <div className="skeleton summary-skeleton" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Totals({ currency, in: incoming, out, pending }: CurrencyTotals) {
  return (
    <div className="stat">
      <dt>{currency}</dt>
      <dd data-direction={incoming > 0 ? 'in' : undefined}>
        <span>In</span> {formatMoney(incoming, currency)}
      </dd>
      <dd>
        <span>Out</span> {formatMoney(out, currency)}
      </dd>
      <dd className="badge" data-status="PENDING">
        Pending {formatMoney(pending, currency)}
      </dd>
    </div>
  )
}
