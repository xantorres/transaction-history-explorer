import { describe, expect, test } from 'vitest'
import { formatMoney, minorDigits, toDecimal, toMinorBound } from './money'

test('minor digits come from the currency definition', () => {
  expect(minorDigits('EUR')).toBe(2)
  expect(minorDigits('JPY')).toBe(0)
})

describe('toDecimal', () => {
  test.each([
    [-1250, 'EUR', '-12.50'],
    [5, 'EUR', '0.05'],
    [0, 'GBP', '0.00'],
    [1200, 'JPY', '1200'],
    [-7, 'JPY', '-7'],
    [123456789012345, 'USD', '1234567890123.45'],
  ] as const)('%i %s -> %s', (minor, currency, expected) => {
    expect(toDecimal(minor, currency)).toBe(expected)
  })
})

describe('toMinorBound', () => {
  test('keeps exact values in the currency minor unit', () => {
    expect(toMinorBound('249.99', 'EUR', 'ceil')).toBe(24999)
    expect(toMinorBound('12.5', 'EUR', 'floor')).toBe(1250)
    expect(toMinorBound('100', 'EUR', 'ceil')).toBe(10000)
  })

  test('rounds fractions the currency cannot hold towards the inside of the range', () => {
    expect(toMinorBound('249.99', 'JPY', 'ceil')).toBe(250)
    expect(toMinorBound('249.99', 'JPY', 'floor')).toBe(249)
    expect(toMinorBound('0.001', 'EUR', 'ceil')).toBe(1)
    expect(toMinorBound('0.001', 'EUR', 'floor')).toBe(0)
    expect(toMinorBound('3.000', 'EUR', 'ceil')).toBe(300)
  })
})

test('formatMoney shows the sign and the currency precision', () => {
  expect(formatMoney(-123456, 'EUR')).toBe('-€1,234.56')
  expect(formatMoney(1200, 'JPY')).toBe('+¥1,200')
  expect(formatMoney(0, 'USD')).toBe('$0.00')
  expect(formatMoney(123456789012345, 'GBP')).toBe('+£1,234,567,890,123.45')
})
