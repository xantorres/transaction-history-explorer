import { Fragment, useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { viewerZone } from '../dates.ts'
import { CATEGORIES, CURRENCIES, STATUS_LABELS, STATUSES } from '../domain.ts'
import { DECIMAL } from '../money.ts'
import { clearFilters, updateView, useClears } from '../url-state.ts'
import type { View } from '../url-state.ts'
import { DebouncedInput } from './DebouncedInput.tsx'

const LAST_DAY = '9999-12-31'

function parseAmount(draft: string) {
  const value = draft.trim().replace(',', '.')
  return DECIMAL.test(value) ? value : ''
}

export function FilterBar({ view }: { view: View }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const clears = useClears()
  const [chosen, setChosen] = useState<{ param: string; value: string }>()
  const { q, from, to, min, max, currency, status, category } = view
  const filterCount = [from, to, min, max, currency, status, category].filter(Boolean).length
  const unfiltered = !q && filterCount === 0
  const datesInverted = from !== undefined && to !== undefined && from > to
  const amountsInverted = min !== undefined && max !== undefined && Number(min) > Number(max)

  const text = (param: 'q' | 'from' | 'to' | 'min' | 'max') => ({
    value: view[param] ?? '',
    onCommit: (value: string, mode: 'push' | 'replace') => {
      updateView({ [param]: value }, mode)
    },
  })
  // Like typing, one visit to a select is one step back, unless history moved since its last pick.
  const choice = (param: 'currency' | 'status' | 'category') => ({
    value: view[param] ?? '',
    onFocus: () => {
      setChosen(undefined)
    },
    onChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target
      const repeat = chosen?.param === param && chosen.value === (view[param] ?? '')
      updateView({ [param]: value }, repeat ? 'replace' : 'push')
      setChosen({ param, value })
    },
  })

  return (
    <search id={id} className="filters" data-open={open || undefined}>
      <DebouncedInput
        label="Search"
        type="search"
        placeholder="Counterparty or description"
        {...text('q')}
      />
      <button
        type="button"
        className="filters-toggle"
        aria-controls={id}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        Filters{filterCount > 0 && ` (${String(filterCount)})`}
      </button>
      {/* Clear filters remounts these, so a draft that never applied goes as well. */}
      <Fragment key={clears}>
        <DebouncedInput
          label="From"
          type="date"
          max={to ?? LAST_DAY}
          invalidMessage="Incomplete date"
          error={datesInverted ? 'Later than To' : undefined}
          {...text('from')}
        />
        <DebouncedInput
          label="To"
          type="date"
          min={from}
          max={LAST_DAY}
          invalidMessage="Incomplete date"
          error={datesInverted ? 'Earlier than From' : undefined}
          {...text('to')}
        />
        <DebouncedInput
          label="Min amount"
          inputMode="decimal"
          placeholder="0.00"
          parse={parseAmount}
          invalidMessage="Not a number"
          error={amountsInverted ? 'More than Max' : undefined}
          {...text('min')}
        />
        <DebouncedInput
          label="Max amount"
          inputMode="decimal"
          placeholder="0.00"
          parse={parseAmount}
          invalidMessage="Not a number"
          error={amountsInverted ? 'Less than Min' : undefined}
          {...text('max')}
        />
      </Fragment>
      <label className="field">
        <span>Currency</span>
        <select {...choice('currency')}>
          <option value="">All</option>
          {CURRENCIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select {...choice('status')}>
          <option value="">All</option>
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Category</span>
        <select {...choice('category')}>
          <option value="">All</option>
          {CATEGORIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        // Disabled, it would drop the focus of whoever just pressed it.
        aria-disabled={unfiltered || undefined}
        onClick={() => {
          if (!unfiltered) clearFilters(view)
        }}
      >
        Clear filters
      </button>
      {view.tz !== viewerZone && (
        <p role="note" className="zone-note">
          Dates are days in {view.tz} time
        </p>
      )}
    </search>
  )
}
