import type { Category, Currency, Status, Transaction } from '../src/domain.ts'
import { DAY, MINUTE, zoneOffset } from '../src/dates.ts'
import { minorDigits } from '../src/money.ts'

export const DATA_START = Date.UTC(2024, 9, 1)
export const DATA_END = Date.UTC(2026, 9, 1)
const PENDING_DAYS = 5

export const EURO_RATES: Record<Currency, number> = { EUR: 1, GBP: 0.85, JPY: 160, USD: 1.09 }

type Random = () => number

interface Context {
  random: Random
  incoming: boolean
  reference: string
  period: string
  quarter: string
  year: string
}

interface Payee {
  name: string
  describe: (context: Context) => string
  currency: Currency | undefined
}

const ZONES = [
  'Europe/Nicosia',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
]

const PERIOD = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const CUSTOMERS = [
  'Aegean Freight Ltd',
  'Blue Harbour Hotels',
  'Cedarline Logistics',
  'Dvořák Design s.r.o.',
  'Elysian Travel Group',
  'Fjordline Analytics AS',
  'Golden Olive Trading',
  'Hartmann & Söhne GmbH',
  'Iberia Sol Distribución',
  'Kestrel Media Ltd',
  'Lumière Studios SARL',
  'Marlowe & Finch LLP',
  'Northbeam Retail Co',
  'Østergaard Consulting ApS',
  'Paphos Coastal Resorts',
  'Quayside Partners',
  'Riverstone Capital LLC',
  'Sakura Imports 株式会社',
  'Tavira Digital Lda',
  'Ventura Gaming Ltd',
  'Zürich Data Systems AG',
]

export const HOSTILE = [
  '=HYPERLINK("https://example.com/refund","Claim refund")',
  "=cmd|' /C calc'!A0",
  '=1+2',
  '+44 20 7946 0958',
  '-2+3',
  '@SUM(A1:A9)',
  '\tTab-led reference',
  'Smith, Jones & Partners',
  '"Quoted" Holdings Ltd',
  'Line one\nLine two',
  '<script>alert(1)</script>',
  'Crème Brûlée Café',
]

const each = (names: string[], describe: Payee['describe'], currency?: Currency): Payee[] =>
  names.map((name) => ({ name, describe, currency }))

const transfers = (account: string) =>
  each([account], ({ incoming }) => `Transfer ${incoming ? 'from' : 'to'} ${account.toLowerCase()}`)

const rent = ({ period }: Context) => `Office rent ${period}`

const PAYEES: Record<Category, Payee[]> = {
  Sales: each(CUSTOMERS, ({ year, reference }) => `Invoice INV-${year}-${reference}`),
  Refunds: each(CUSTOMERS, ({ year, reference }) => `Credit note CN-${year}-${reference}`),
  Suppliers: each(
    [
      'Atlas Office Supply',
      'Brightwire Electronics',
      'Corfu Print House',
      'Delta Packaging BV',
      'Evergreen Facilities',
      'Kowalski i Syn Sp. z o.o.',
      'Mesogeia Catering',
    ],
    ({ reference }) => `Purchase order PO-${reference}`,
  ),
  Software: each(
    [
      'Cloudway Hosting',
      'Ledgerly Accounting',
      'Pipeline CI Inc.',
      'Signalbox Messaging',
      'Vaultkeep Security',
    ],
    ({ period }) => `${period} subscription`,
  ),
  Marketing: each(
    ['Adwave Media', 'Brandsmith Agency', 'Clickstream Partners', 'Studio Ocho'],
    ({ period }) => `Campaign ${period}`,
  ),
  Travel: [
    ...each(['Aerolínea Azul', 'Skyward Airlines'], ({ random }) =>
      pick(random, ['Flight LCA-LHR', 'Flight LHR-JFK']),
    ),
    ...each(['Hotel Ermou Athens', 'Kyoto Station Hotel'], ({ random }) =>
      pick(random, ['Hotel, 2 nights', 'Hotel, 3 nights']),
    ),
    ...each(['Larnaca Car Hire'], () => 'Car hire'),
  ],
  Payroll: each(
    [
      'Eleni Georgiou',
      'Andreas Christodoulou',
      'Zoë Müller',
      'José Álvarez',
      "Siobhán O'Connor",
      'Łukasz Nowak',
      'Chloé Dubois',
      'Björn Andersson',
      'Ngozi Okafor',
      'Hiroshi Tanaka',
      'Priya Raman',
      'Mateo Rossi',
    ],
    ({ period }) => `Salary ${period}`,
    'EUR',
  ),
  Rent: [
    ...each(['Limassol Marina Offices', 'Nicosia Business Centre'], rent, 'EUR'),
    ...each(['Shoreditch Workspace Ltd'], rent, 'GBP'),
  ],
  Taxes: [
    ...each(['VAT Service'], ({ quarter, year }) => `VAT return Q${quarter} ${year}`, 'EUR'),
    ...each(['Tax Department'], () => 'Corporate tax instalment', 'EUR'),
    ...each(['Social Insurance Fund'], ({ period }) => `Social insurance ${period}`, 'EUR'),
  ],
  Fees: [
    ...each(['Mediterranean Bank'], () => 'Monthly account fee'),
    ...each(['CardGate Processing'], () => 'Card processing fees'),
    ...each(['SwiftLink Correspondent'], () => 'FX conversion fee'),
  ],
  Transfers: [...transfers('Treasury account'), ...transfers('Reserve account')],
}

const AMOUNT_RANGES: Record<Category, [number, number]> = {
  Sales: [20, 25_000],
  Refunds: [10, 2_000],
  Suppliers: [50, 40_000],
  Software: [10, 3_000],
  Marketing: [100, 20_000],
  Travel: [25, 4_000],
  Payroll: [1_800, 9_000],
  Rent: [2_500, 12_000],
  Taxes: [300, 60_000],
  Fees: [1, 250],
  Transfers: [1_000, 250_000],
}

const weighted = <T>(weights: [T, number][]) =>
  weights.flatMap(([value, weight]) => Array<T>(weight).fill(value))

const CATEGORY_TABLE = weighted<Category>([
  ['Sales', 26],
  ['Suppliers', 18],
  ['Fees', 12],
  ['Software', 8],
  ['Payroll', 8],
  ['Marketing', 7],
  ['Travel', 7],
  ['Transfers', 5],
  ['Refunds', 4],
  ['Taxes', 3],
  ['Rent', 2],
])

const CURRENCY_TABLE = weighted<Currency>([
  ['EUR', 12],
  ['USD', 4],
  ['GBP', 3],
  ['JPY', 1],
])

function mulberry32(seed: number): Random {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new RangeError('Cannot pick from an empty list')
  return item
}

const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

function withOffset(instant: number, offset: number) {
  const local = new Date(instant + offset * MINUTE).toISOString().slice(0, 19)
  const sign = offset < 0 ? '-' : '+'
  const minutes = Math.abs(offset)
  return `${local}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function amountFor(random: Random, category: Category, currency: Currency) {
  const [low, high] = AMOUNT_RANGES[category]
  const top = random() < 0.85 ? Math.min(high, low * 10) : high
  const cents = between(random, low * 100, top * 100)
  const scale = 10 ** (minorDigits(currency) - minorDigits('EUR'))
  return Math.round(cents * EURO_RATES[currency] * scale)
}

const isIncoming = (random: Random, category: Category) =>
  category === 'Sales' || (category === 'Transfers' && random() < 0.5)

function contextFor(random: Random, incoming: boolean, instant: number, index: number): Context {
  const date = new Date(instant)
  return {
    random,
    incoming,
    reference: pad(index + 1, 6),
    period: PERIOD.format(instant),
    quarter: String(Math.floor(date.getUTCMonth() / 3) + 1),
    year: String(date.getUTCFullYear()),
  }
}

function statusFor(random: Random, instant: number): Status {
  if (instant >= DATA_END - PENDING_DAYS * DAY) return random() < 0.7 ? 'PENDING' : 'BOOKED'
  return random() < 0.03 ? 'REVERSED' : 'BOOKED'
}

export function generateTransactions(count: number, seed = 20_240_101): Transaction[] {
  const random = mulberry32(seed)
  const seconds = (DATA_END - DATA_START) / 1000
  return Array.from({ length: count }, (_, index) => {
    const instant = DATA_START + Math.floor(random() * seconds) * 1000
    const category = pick(random, CATEGORY_TABLE)
    const payee = pick(random, PAYEES[category])
    const currency = payee.currency ?? pick(random, CURRENCY_TABLE)
    const incoming = isIncoming(random, category)
    const magnitude = amountFor(random, category, currency)
    let counterparty = payee.name
    let description = payee.describe(contextFor(random, incoming, instant, index))
    if (random() < 0.005) {
      if (random() < 0.5) counterparty = pick(random, HOSTILE)
      else description = pick(random, HOSTILE)
    }
    return {
      id: `tx_${(Math.imul(index + 1, 0x9e3779b1) >>> 0).toString(16).padStart(8, '0')}`,
      timestamp: withOffset(instant, zoneOffset(pick(random, ZONES), instant)),
      counterparty,
      description,
      amount: incoming ? magnitude : -magnitude,
      currency,
      category,
      status: statusFor(random, instant),
    }
  })
}
