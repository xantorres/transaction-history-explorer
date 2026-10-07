import react from '@vitejs/plugin-react'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'
import { createApi } from './server/api.ts'
import { generateTransactions } from './server/data.ts'
import { createStore } from './server/store.ts'

function mockApi(simulateFaults: boolean): Plugin {
  let api: ReturnType<typeof createApi> | undefined
  const load = () =>
    (api ??= createApi({ store: createStore(generateTransactions(100_000)), simulateFaults }))

  const serve: Connect.NextHandleFunction = (req, res) => {
    const controller = new AbortController()
    res.on('close', () => {
      controller.abort()
    })
    // Request throws on methods like TRACE, and that has to reach the catch, not the dev server.
    const respond = async () => {
      const request = new Request(new URL(req.originalUrl ?? '/', 'http://localhost'), {
        method: req.method,
        headers: { cookie: req.headers.cookie ?? '' },
        signal: controller.signal,
      })
      const response = await load()(request)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
    }
    respond().catch(() => {
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

export default defineConfig(({ isPreview }) => ({
  plugins: [react(), mockApi(!isPreview)],
  test: {
    include: ['{src,server}/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    env: { TZ: 'America/New_York' },
    setupFiles: ['src/test/setup.ts'],
    unstubGlobals: true,
    restoreMocks: true,
  },
}))
