import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 800 },
  offsetWidth: { get: () => 1200 },
})

afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
  document.cookie = 'faults=; max-age=0'
})
