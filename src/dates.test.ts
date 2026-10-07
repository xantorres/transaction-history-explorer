import { describe, expect, test } from 'vitest'
import {
  canonicalZone,
  formatDateTime,
  formatOriginalTime,
  isIsoDate,
  nextDay,
  zonedDayStart,
  zoneOffset,
} from './dates.ts'

test('zoneOffset follows daylight saving transitions', () => {
  expect(zoneOffset('Europe/London', Date.parse('2026-03-29T00:59:00Z'))).toBe(0)
  expect(zoneOffset('Europe/London', Date.parse('2026-03-29T01:00:00Z'))).toBe(60)
  expect(zoneOffset('America/New_York', Date.parse('2026-03-08T06:59:00Z'))).toBe(-300)
  expect(zoneOffset('America/New_York', Date.parse('2026-03-08T07:00:00Z'))).toBe(-240)
  expect(zoneOffset('Asia/Kolkata', Date.parse('2026-01-01T00:00:00Z'))).toBe(330)
  expect(zoneOffset('UTC', Date.parse('2026-01-01T00:00:00Z'))).toBe(0)
})

describe('zonedDayStart', () => {
  const start = (date: string, timeZone: string) =>
    new Date(zonedDayStart(date, timeZone)).toISOString()
  const hours = (date: string, timeZone: string) =>
    (zonedDayStart(nextDay(date), timeZone) - zonedDayStart(date, timeZone)) / 3_600_000

  test('finds local midnight as a UTC instant', () => {
    expect(start('2026-01-15', 'Europe/London')).toBe('2026-01-15T00:00:00.000Z')
    expect(start('2026-07-15', 'Europe/London')).toBe('2026-07-14T23:00:00.000Z')
    expect(start('2026-01-01', 'Asia/Kolkata')).toBe('2025-12-31T18:30:00.000Z')
    expect(start('2026-01-01', 'Pacific/Kiritimati')).toBe('2025-12-31T10:00:00.000Z')
  })

  test('gives daylight saving days their real length', () => {
    expect(hours('2026-03-29', 'Europe/London')).toBe(23)
    expect(hours('2026-10-25', 'Europe/London')).toBe(25)
    expect(hours('2026-03-08', 'America/New_York')).toBe(23)
    expect(hours('2026-11-01', 'America/New_York')).toBe(25)
    expect(hours('2026-04-05', 'Australia/Sydney')).toBe(25)
  })

  test('starts the day when the clocks jump if midnight never happens', () => {
    expect(start('2026-09-06', 'America/Santiago')).toBe('2026-09-06T04:00:00.000Z')
    expect(hours('2026-09-06', 'America/Santiago')).toBe(23)
    expect(hours('2026-04-04', 'America/Santiago')).toBe(25)
  })
})

test('nextDay crosses months, years and leap days', () => {
  expect(nextDay('2026-01-31')).toBe('2026-02-01')
  expect(nextDay('2026-12-31')).toBe('2027-01-01')
  expect(nextDay('2028-02-28')).toBe('2028-02-29')
  expect(nextDay('9999-12-31')).toBe('+010000-01-01')
})

test('isIsoDate accepts real calendar days only', () => {
  expect(isIsoDate('2026-02-28')).toBe(true)
  expect(isIsoDate('2028-02-29')).toBe(true)
  expect(isIsoDate('0001-01-01')).toBe(true)
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-1', '20260101', '']) {
    expect(isIsoDate(value)).toBe(false)
  }
  expect(isIsoDate('0000-12-31')).toBe(false)
})

test('canonicalZone resolves IANA names and rejects the rest', () => {
  expect(canonicalZone('Europe/London')).toBe('Europe/London')
  expect(canonicalZone('europe/london')).toBe('Europe/London')
  expect(canonicalZone('Mars/Olympus_Mons')).toBeUndefined()
  expect(canonicalZone('')).toBeUndefined()
})

test('formatDateTime shows the instant in the viewer zone', () => {
  expect(formatDateTime('2026-10-01T00:55:28+01:00').replace(/\s/g, ' ')).toBe(
    'Sep 30, 2026, 7:55 PM',
  )
})

test('formatOriginalTime keeps the wall clock and offset it was recorded with', () => {
  const format = (iso: string) => formatOriginalTime(iso).replace(/\s/g, ' ')
  expect(format('2026-10-01T00:55:28+01:00')).toBe('Oct 1, 2026, 12:55 AM UTC+01:00')
  expect(format('2026-03-08T23:10:00-04:00')).toBe('Mar 8, 2026, 11:10 PM UTC-04:00')
  expect(format('2026-01-01T09:00:00+05:30')).toBe('Jan 1, 2026, 9:00 AM UTC+05:30')
})
