import { CURRENCIES, type Currency } from './domain'

const DIGITS = Object.fromEntries(
  CURRENCIES.map((currency) => {
    const { maximumFractionDigits = 2 } = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions()
    return [currency, maximumFractionDigits]
  }),
) as Record<Currency, number>

export const minorDigits = (currency: Currency) => DIGITS[currency]

export function toDecimal(minor: number, currency: Currency): `${number}` {
  const digits = DIGITS[currency]
  const sign = minor < 0 ? '-' : ''
  const units = String(Math.abs(minor)).padStart(digits + 1, '0')
  const decimal = digits ? `${units.slice(0, -digits)}.${units.slice(-digits)}` : units
  return `${sign}${decimal}` as `${number}`
}

export function toMinorBound(decimal: string, currency: Currency, round: 'ceil' | 'floor') {
  const digits = DIGITS[currency]
  const [whole = '', fraction = ''] = decimal.split('.')
  const minor = Number(whole + fraction.slice(0, digits).padEnd(digits, '0'))
  const truncated = /[1-9]/.test(fraction.slice(digits))
  return round === 'ceil' && truncated ? minor + 1 : minor
}

const formatters = new Map<Currency, Intl.NumberFormat>()

export function formatMoney(minor: number, currency: Currency) {
  let formatter = formatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency,
      signDisplay: 'exceptZero',
    })
    formatters.set(currency, formatter)
  }
  return formatter.format(toDecimal(minor, currency))
}
