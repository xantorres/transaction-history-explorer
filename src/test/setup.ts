import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 800 },
})

// jsdom has no modal dialogs yet.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  history.pushState(null, '', '/')
  document.cookie = 'faults=; max-age=0'
})
