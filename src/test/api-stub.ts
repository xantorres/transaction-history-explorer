import { vi } from 'vitest'
import { createApi } from '../../server/api.ts'
import { generateTransactions } from '../../server/data.ts'
import { createStore } from '../../server/store.ts'

export const store = createStore(generateTransactions(1_000))

const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason as Error)
      },
      { once: true },
    )
  })

export function installApi(rows = store) {
  const handle = createApi({ store: rows, latency: () => 0, simulateFaults: true })
  const requests: { url: URL; signal: AbortSignal }[] = []
  const holds: { matches: (url: URL) => boolean; released: Promise<void> }[] = []

  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    const request = new Request(new URL(path, location.origin), {
      ...init,
      headers: { cookie: document.cookie },
    })
    const url = new URL(request.url)
    requests.push({ url, signal: request.signal })
    const hold = holds.find(({ matches }) => matches(url))
    if (hold) await Promise.race([hold.released, aborted(request.signal)])
    return handle(request)
  })

  function hold(matches: (url: URL) => boolean) {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    holds.push({ matches, released })
    return release
  }

  return { requests, hold }
}
