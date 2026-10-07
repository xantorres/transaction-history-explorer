import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ApiError, transactionQuery } from '../api.ts'
import { formatDateTime, formatOriginalTime } from '../dates.ts'
import type { Status, Transaction } from '../domain.ts'
import { formatMoney } from '../money.ts'
import { closeTransaction } from '../url-state.ts'
import { StatusBadge } from './StatusBadge.tsx'

const NOTES: Partial<Record<Status, string>> = {
  PENDING:
    'Not booked yet, so the amount can still change and it stays out of the in and out totals.',
  REVERSED: 'The payment was returned, so it never counts towards the totals.',
}

export function TransactionDrawer({ id }: { id?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  // A drag that starts or ends inside the drawer, like selecting its text, is not a backdrop click.
  const onBackdrop = useRef(false)

  useEffect(() => {
    const element = dialog.current
    if (id && !element?.open) element?.showModal()
    if (!id && element?.open) element.close()
  }, [id])

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        closeTransaction()
      }}
      onPointerDown={(event) => {
        onBackdrop.current = event.target === event.currentTarget
      }}
      onPointerUp={(event) => {
        onBackdrop.current &&= event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (onBackdrop.current && event.target === event.currentTarget) closeTransaction()
      }}
    >
      {id && <Details id={id} />}
    </dialog>
  )
}

function Details({ id }: { id: string }) {
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const { data, error, isFetching, refetch } = useQuery(transactionQuery(id, client))
  const missing = error instanceof ApiError && error.status === 404

  return (
    <div className="drawer-body" data-status={data?.status}>
      <header className="drawer-head">
        <h2 ref={heading} id="drawer-title" tabIndex={-1}>
          {data?.counterparty ?? (missing ? 'Transaction not found' : 'Transaction')}
        </h2>
        <button type="button" className="close" aria-label="Close" onClick={closeTransaction}>
          ×
        </button>
      </header>
      {data ? (
        <Facts transaction={data} />
      ) : missing ? (
        <p>There is no transaction with this ID. The link may be mistyped or out of date.</p>
      ) : error ? (
        <p className="drawer-error">
          <span role="alert">Couldn't load this transaction.</span>
          <button
            type="button"
            disabled={isFetching}
            onClick={() => {
              heading.current?.focus()
              void refetch()
            }}
          >
            Retry
          </button>
        </p>
      ) : (
        <div className="skeleton drawer-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}

function Facts({ transaction }: { transaction: Transaction }) {
  const { id, timestamp, description, category, currency, amount, status } = transaction
  const note = NOTES[status]

  return (
    <>
      <p className="drawer-amount" data-direction={amount > 0 ? 'in' : 'out'}>
        {formatMoney(amount, currency)}
      </p>
      <StatusBadge status={status} />
      {note && <p className="note">{note}</p>}
      <dl className="facts">
        <div>
          <dt>Your time</dt>
          <dd>
            <time dateTime={timestamp}>{formatDateTime(timestamp)}</time>
          </dd>
        </div>
        <div>
          <dt>Original time</dt>
          <dd>{formatOriginalTime(timestamp)}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{description}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{category}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{currency}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd>
            <code>{id}</code>
          </dd>
        </div>
      </dl>
    </>
  )
}
