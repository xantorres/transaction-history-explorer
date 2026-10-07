import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { generateTransactions } from '../server/data.ts'
import { createStore } from '../server/store.ts'
import { CSV_HEADER, transactionCsvRow } from './csv.ts'
import { installApi } from './test/api-stub.ts'
import { field, renderApp } from './test/app.tsx'

const store = createStore(generateTransactions(12_000))
const booked = store.list({ status: 'BOOKED' }, 'amount', null, 12_000).items
const count = (value: number) => value.toLocaleString('en-US')

function captureDownloads() {
  const files: { name: string; blob: Blob }[] = []
  let blob: Blob | undefined
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    blob = object as Blob
    return 'blob:export'
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (blob) files.push({ name: this.download, blob })
  })
  return files
}

const read = async (blob: Blob) =>
  new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())
const isChunk = (url: URL) => url.searchParams.get('limit') === '5000'
const isLaterChunk = (url: URL) => isChunk(url) && url.searchParams.has('cursor')
const progress = () => screen.getByRole('status').textContent

afterEach(() => {
  vi.useRealTimers()
})

test('exports every row of the result to a dated file, 5,000 rows at a time', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-09T03:30:00Z'))
  const api = installApi(store)
  const files = captureDownloads()
  renderApp('?status=BOOKED&sort=amount')

  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  await waitFor(() => {
    expect(files).toHaveLength(1)
  })
  const [file] = files
  expect(file?.name).toBe('transactions-2026-03-08.csv')
  expect(await read(file?.blob ?? new Blob())).toBe(
    CSV_HEADER + booked.map(transactionCsvRow).join(''),
  )
  const chunks = api.requests.filter(({ url }) => isChunk(url))
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks).toHaveLength(Math.ceil(booked.length / 5000))
  expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDefined()
})

test('keeps the filters and total from the moment of the click', async () => {
  const api = installApi(store)
  const files = captureDownloads()
  const release = api.hold(isLaterChunk)
  renderApp('?status=BOOKED&sort=amount')
  await screen.findByText(count(booked.length))

  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  await waitFor(() => {
    expect(progress()).toBe(`5,000 of ${count(booked.length)} rows`)
  })
  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  const euros = store.summary({ status: 'BOOKED', currency: 'EUR' }).count
  await screen.findByText(count(euros))
  expect(progress()).toBe(`5,000 of ${count(booked.length)} rows`)

  release()
  await waitFor(() => {
    expect(files).toHaveLength(1)
  })
  expect(await read(files[0]?.blob ?? new Blob())).toBe(
    CSV_HEADER + booked.map(transactionCsvRow).join(''),
  )
  const params = api.requests.filter(({ url }) => isChunk(url)).map(({ url }) => url.searchParams)
  expect(params.every((query) => query.get('status') === 'BOOKED')).toBe(true)
  expect(params.some((query) => query.has('currency'))).toBe(false)
})

test('counts rows without a total while the summary is out of date', async () => {
  const api = installApi(store)
  captureDownloads()
  renderApp('?status=BOOKED')
  await screen.findByText(count(booked.length))
  api.hold((url) => url.pathname === '/api/summary')
  api.hold(isChunk)

  fireEvent.change(field('Currency'), { target: { value: 'EUR' } })
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  expect(progress()).toBe('0 rows')
})

test('cancelling stops the export without a download or an error', async () => {
  const api = installApi(store)
  const files = captureDownloads()
  api.hold(isChunk)
  renderApp()

  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await screen.findByRole('button', { name: 'Export CSV' })
  expect(api.requests.find(({ url }) => isChunk(url))?.signal.aborted).toBe(true)
  expect(files).toHaveLength(0)
  expect(progress()).toBe('')
})

test('a failed chunk ends the export with a message and can be retried', async () => {
  installApi(store)
  const files = captureDownloads()
  document.cookie = 'faults=page'
  renderApp()

  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  await waitFor(() => {
    expect(progress()).toBe("Couldn't export. Try again.")
  })
  expect(files).toHaveLength(0)

  document.cookie = 'faults=; max-age=0'
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  await waitFor(() => {
    expect(files).toHaveLength(1)
  })
  expect(progress()).toBe('')
})
