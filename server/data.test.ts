import { describe, expect, test } from 'vitest'
import { CATEGORIES, CURRENCIES, STATUSES } from '../src/domain.ts'
import { DATA_END, DATA_START, HOSTILE, generateTransactions } from './data.ts'

const rows = generateTransactions(5_000)
const honest = rows.filter(
  (row) => !HOSTILE.includes(row.counterparty) && !HOSTILE.includes(row.description),
)

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

  test('pays salaries, rent and taxes in the currency of the office', () => {
    for (const row of honest) {
      if (row.category !== 'Payroll' && row.category !== 'Rent' && row.category !== 'Taxes') {
        continue
      }
      expect(row.currency).toBe(row.counterparty === 'Shoreditch Workspace Ltd' ? 'GBP' : 'EUR')
    }
  })

  test('dates each salary by the month it pays for', () => {
    const salaries = honest.filter((row) => row.category === 'Payroll')
    expect(salaries.filter((row) => !/^Salary [A-Z][a-z]+ \d{4}$/.test(row.description))).toEqual(
      [],
    )
  })

  test('never reuses an invoice or credit note number', () => {
    const numbers = honest.flatMap((row) => /\b(?:INV|CN)-\d{4}-\d+/.exec(row.description) ?? [])
    expect(numbers.length).toBeGreaterThan(1_000)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  test('describes a transfer by the direction the money moved', () => {
    const transfers = honest.filter((row) => row.category === 'Transfers')
    expect(transfers.length).toBeGreaterThan(0)
    for (const row of transfers) {
      const direction = row.amount > 0 ? 'from' : 'to'
      expect(row.description).toBe(`Transfer ${direction} ${row.counterparty.toLowerCase()}`)
    }
  })

  test.each([
    ['Aerolínea Azul', 'Flight '],
    ['Skyward Airlines', 'Flight '],
    ['Kyoto Station Hotel', 'Hotel, '],
    ['Larnaca Car Hire', 'Car hire'],
    ['VAT Service', 'VAT return '],
    ['Social Insurance Fund', 'Social insurance '],
    ['Tax Department', 'Corporate tax instalment'],
    ['Mediterranean Bank', 'Monthly account fee'],
    ['CardGate Processing', 'Card processing fees'],
  ])('bills %s only for what it sells', (counterparty, service) => {
    const billed = honest.filter((row) => row.counterparty === counterparty)
    expect(billed.length).toBeGreaterThan(0)
    expect(billed.filter(({ description }) => !description.startsWith(service))).toEqual([])
  })
})
