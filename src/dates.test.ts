import { expect, test } from 'vitest'
import { zoneOffset } from './dates.ts'

test('zoneOffset follows daylight saving transitions', () => {
  expect(zoneOffset('Europe/London', Date.parse('2026-03-29T00:59:00Z'))).toBe(0)
  expect(zoneOffset('Europe/London', Date.parse('2026-03-29T01:00:00Z'))).toBe(60)
  expect(zoneOffset('America/New_York', Date.parse('2026-03-08T06:59:00Z'))).toBe(-300)
  expect(zoneOffset('America/New_York', Date.parse('2026-03-08T07:00:00Z'))).toBe(-240)
  expect(zoneOffset('Asia/Kolkata', Date.parse('2026-01-01T00:00:00Z'))).toBe(330)
  expect(zoneOffset('UTC', Date.parse('2026-01-01T00:00:00Z'))).toBe(0)
})
