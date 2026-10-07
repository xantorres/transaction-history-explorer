import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 800 },
  offsetWidth: { get: () => 1200 },
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
  history.replaceState(null, '', '/')
  document.cookie = 'faults=; max-age=0'
})
