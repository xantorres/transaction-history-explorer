import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { viewerZone } from '../dates.ts'
import { CATEGORIES, CURRENCIES, STATUS_LABELS, STATUSES } from '../domain.ts'
import { DECIMAL } from '../money.ts'
import { clearFilters, updateView } from '../url-state.ts'
import type { View } from '../url-state.ts'
import { DebouncedInput } from './DebouncedInput.tsx'

function parseAmount(draft: string) {
  const value = draft.trim().replace(',', '.')
  return DECIMAL.test(value) ? value : ''
}

export function FilterBar({ view }: { view: View }) {
  const [open, setOpen] = useState(false)
  const { q, from, to, min, max, currency, status, category } = view
  const filterCount = [from, to, min, max, currency, status, category].filter(Boolean).length

  const text = (param: 'q' | 'from' | 'to' | 'min' | 'max') => ({
    value: view[param] ?? '',
    onCommit: (value: string, mode: 'push' | 'replace') => {
      updateView({ [param]: value }, mode)
    },
  })
  const choice = (param: 'currency' | 'status' | 'category') => ({
    value: view[param] ?? '',
    onChange: (event: ChangeEvent<HTMLSelectElement>) => {
      updateView({ [param]: event.target.value }, 'push')
    },
  })

  return (
    <search className="filters" data-open={open || undefined}>
      <DebouncedInput
        label="Search"
        type="search"
        placeholder="Counterparty or description"
        {...text('q')}
      />
      <button
        type="button"
        className="filters-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        Filters{filterCount > 0 && ` (${String(filterCount)})`}
      </button>
      <DebouncedInput label="From" type="date" max={to} {...text('from')} />
      <DebouncedInput label="To" type="date" min={from} {...text('to')} />
      <DebouncedInput
        label="Min amount"
        inputMode="decimal"
        placeholder="0.00"
        parse={parseAmount}
        {...text('min')}
      />
      <DebouncedInput
        label="Max amount"
        inputMode="decimal"
        placeholder="0.00"
        parse={parseAmount}
        {...text('max')}
      />
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
        disabled={!q && filterCount === 0}
        onClick={() => {
          clearFilters(view)
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
