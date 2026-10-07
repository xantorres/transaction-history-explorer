import { describe, expect, test } from 'vitest'
import { CATEGORIES, CURRENCIES, STATUSES } from '../src/domain.ts'
import { DATA_END, DATA_START, generateTransactions } from './data.ts'

const rows = generateTransactions(5_000)

describe('generateTransactions', () => {
  test('is deterministic for a seed', () => {
    expect(generateTransactions(200)).toEqual(rows.slice(0, 200))
    expect(generateTransactions(200, 7)).not.toEqual(rows.slice(0, 200))
  })

  test('gives every row a unique opaque id', () => {
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    expect(rows[0]?.id).toMatch(/^tx_[0-9a-f]{8}$/)
  })

  test('stamps each row with its original offset inside the data window', () => {
    for (const { timestamp } of rows) {
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
      const instant = Date.parse(timestamp)
      expect(instant).toBeGreaterThanOrEqual(DATA_START)
      expect(instant).toBeLessThan(DATA_END)
    }
    const offsets = new Set(rows.map((row) => row.timestamp.slice(-6)))
    for (const offset of ['+00:00', '+01:00', '-05:00', '-04:00', '+05:30', '+09:00', '+11:00']) {
      expect(offsets.has(offset), offset).toBe(true)
    }
  })

  test('uses every currency, category and status with signed integer minor amounts', () => {
    expect(new Set(rows.map((row) => row.currency))).toEqual(new Set(CURRENCIES))
    expect(new Set(rows.map((row) => row.category))).toEqual(new Set(CATEGORIES))
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(STATUSES))
    for (const row of rows) {
      expect(Number.isSafeInteger(row.amount) && row.amount !== 0).toBe(true)
      if (row.category === 'Sales') expect(row.amount).toBeGreaterThan(0)
      if (row.category === 'Payroll') expect(row.amount).toBeLessThan(0)
    }
  })

  test('keeps pending rows in the last days of the window', () => {
    const pending = rows.filter((row) => row.status === 'PENDING')
    expect(pending.length).toBeGreaterThan(0)
    for (const row of pending) {
      expect(Date.parse(row.timestamp)).toBeGreaterThan(DATA_END - 5 * 86_400_000)
    }
  })

  test('mixes in text that trips up spreadsheets and naive rendering', () => {
    const text = rows.flatMap((row) => [row.counterparty, row.description])
    expect(text.some((value) => value.startsWith('='))).toBe(true)
    expect(text.some((value) => value.includes('\n'))).toBe(true)
    expect(text.some((value) => value.includes('"'))).toBe(true)
  })
})
