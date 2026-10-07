import { useEffect, useMemo } from 'react'
import { toFilters } from './api.ts'
import { TransactionTable } from './components/TransactionTable.tsx'
import { canonicalizeUrl, useView } from './url-state.ts'

export function App() {
  const view = useView()
  const filters = useMemo(() => toFilters(view), [view])
  useEffect(canonicalizeUrl, [])

  return (
    <main className="app">
      <header className="masthead">
        <h1>Transactions</h1>
      </header>
      <TransactionTable view={view} filters={filters} />
    </main>
  )
}
