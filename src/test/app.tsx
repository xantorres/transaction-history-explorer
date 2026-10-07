import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect } from 'vitest'
import { App } from '../App.tsx'
import { createQueryClient } from '../api.ts'

export function renderApp(search = '') {
  history.replaceState(null, '', `/${search}`)
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

export const dataRows = () =>
  screen.getAllByRole('row').filter((row) => Number(row.getAttribute('aria-rowindex')) > 1)

export const rowAt = (rowIndex: number) =>
  screen.getAllByRole('row').find((row) => row.getAttribute('aria-rowindex') === String(rowIndex))

export const hrefAt = (rowIndex: number) => {
  const row = rowAt(rowIndex)
  return row && within(row).getByRole('link').getAttribute('href')
}

export const waitForRows = () =>
  waitFor(() => {
    expect(rowAt(2)).toBeDefined()
  })

export const field = (label: string) =>
  screen.getByLabelText<HTMLInputElement | HTMLSelectElement>(label)

export function fill(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } })
  fireEvent.blur(field(label))
}
