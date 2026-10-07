import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { summaryQuery, toFilters } from './api.ts'
import { DevFaults } from './components/DevFaults.tsx'
import { ExportButton } from './components/ExportButton.tsx'
import { FilterBar } from './components/FilterBar.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { TransactionDrawer } from './components/TransactionDrawer.tsx'
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
        <ExportButton
          filters={filters}
          sort={view.sort}
          total={summary.isPlaceholderData ? undefined : summary.data?.count}
        />
      </header>
      <FilterBar view={view} />
      <SummaryBar summary={summary} />
      <TransactionTable view={view} filters={filters} total={summary.data?.count} />
      <TransactionDrawer id={view.tx} />
      {import.meta.env.DEV && <DevFaults />}
    </main>
  )
}
