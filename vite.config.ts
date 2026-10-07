import react from '@vitejs/plugin-react'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'
import { createApi } from './server/api'
import { generateTransactions } from './server/data'
import { createStore } from './server/store'

function mockApi(): Plugin {
  let api: ReturnType<typeof createApi> | undefined
  const load = () => (api ??= createApi({ store: createStore(generateTransactions(100_000)) }))

  const serve: Connect.NextHandleFunction = (req, res) => {
    const controller = new AbortController()
    res.on('close', () => {
      controller.abort()
    })
    const request = new Request(new URL(req.originalUrl ?? '/', 'http://localhost'), {
      method: req.method,
      headers: { cookie: req.headers.cookie ?? '' },
      signal: controller.signal,
    })
    load()(request)
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(await response.text())
      })
      .catch(() => {
        res.statusCode = 500
        res.end()
      })
  }

  const mount = (server: Pick<ViteDevServer, 'httpServer' | 'middlewares'>) => {
    server.httpServer?.once('listening', load)
    server.middlewares.use('/api', serve)
  }

  return { name: 'mock-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  plugins: [react(), mockApi()],
  test: { environment: 'jsdom', env: { TZ: 'America/New_York' } },
})
