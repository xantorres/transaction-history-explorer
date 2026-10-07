import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { summaryQuery, toFilters } from './api.ts'
import { FilterBar } from './components/FilterBar.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { TransactionTable } from './components/TransactionTable.tsx'
import { canonicalizeUrl, useView } from './url-state.ts'

export function App() {
  const view = useView()
  const filters = useMemo(() => toFilters(view), [view])
  const summary = useQuery(summaryQuery(filters))
  useEffect(canonicalizeUrl, [])

  return (
    <main className="app">
      <header className="masthead">
        <h1>Transactions</h1>
      </header>
      <FilterBar view={view} />
      <SummaryBar summary={summary} />
      <TransactionTable view={view} filters={filters} total={summary.data?.count} />
    </main>
  )
}
