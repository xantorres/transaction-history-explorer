import type { Category, Currency, Status, Transaction } from '../src/domain.ts'
import { zoneOffset } from '../src/dates.ts'

export const DATA_START = Date.UTC(2024, 9, 1)
export const DATA_END = Date.UTC(2026, 9, 1)
const DAY = 86_400_000
const PENDING_DAYS = 5

type Random = () => number

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

const COUNTERPARTIES: Record<Exclude<Category, 'Sales' | 'Refunds'>, string[]> = {
  Suppliers: [
    'Atlas Office Supply',
    'Brightwire Electronics',
    'Corfu Print House',
    'Delta Packaging BV',
    'Evergreen Facilities',
    'Kowalski i Syn Sp. z o.o.',
    'Mesogeia Catering',
  ],
  Software: [
    'Cloudway Hosting',
    'Ledgerly Accounting',
    'Pipeline CI Inc.',
    'Signalbox Messaging',
    'Vaultkeep Security',
  ],
  Marketing: ['Adwave Media', 'Brandsmith Agency', 'Clickstream Partners', 'Studio Ocho'],
  Travel: [
    'Aerolínea Azul',
    'Hotel Ermou Athens',
    'Kyoto Station Hotel',
    'Larnaca Car Hire',
    'Skyward Airlines',
  ],
  Payroll: [
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
  Rent: ['Limassol Marina Offices', 'Nicosia Business Centre', 'Shoreditch Workspace Ltd'],
  Taxes: ['Tax Department', 'VAT Service', 'Social Insurance Fund'],
  Fees: ['Mediterranean Bank', 'CardGate Processing', 'SwiftLink Correspondent'],
  Transfers: ['Treasury account', 'Reserve account', 'Payment provider settlement'],
}

const HOSTILE = [
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
  const local = new Date(instant + offset * 60_000).toISOString().slice(0, 19)
  const sign = offset < 0 ? '-' : '+'
  const minutes = Math.abs(offset)
  return `${local}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function amountFor(random: Random, category: Category, currency: Currency) {
  const [low, high] = AMOUNT_RANGES[category]
  const top = random() < 0.85 ? Math.min(high, low * 10) : high
  const cents = between(random, low * 100, top * 100)
  return currency === 'JPY' ? Math.floor((cents * 16) / 10) : cents
}

function isIncoming(random: Random, category: Category) {
  return category === 'Sales' || (category === 'Transfers' && random() < 0.5)
}

function descriptionFor(random: Random, category: Category, incoming: boolean, instant: number) {
  const date = new Date(instant)
  const year = String(date.getUTCFullYear())
  const period = PERIOD.format(instant)
  const reference = pad(between(random, 1, 9999), 4)
  switch (category) {
    case 'Sales':
      return `Invoice INV-${year}-${reference}`
    case 'Refunds':
      return `Refund of INV-${year}-${reference}`
    case 'Suppliers':
      return `Purchase order PO-${reference}`
    case 'Software':
      return `${period} subscription`
    case 'Marketing':
      return `Campaign ${period}`
    case 'Payroll':
      return `Salary ${period}`
    case 'Rent':
      return `Office rent ${period}`
    case 'Travel':
      return pick(random, ['Flight LCA-LHR', 'Flight LHR-JFK', 'Hotel, 3 nights', 'Car hire'])
    case 'Taxes':
      return pick(random, [
        `VAT return Q${String(Math.floor(date.getUTCMonth() / 3) + 1)} ${year}`,
        'Corporate tax instalment',
        `Social insurance ${period}`,
      ])
    case 'Fees':
      return pick(random, ['Monthly account fee', 'Card processing fees', 'FX conversion fee'])
    case 'Transfers':
      return incoming ? 'Settlement from payment provider' : 'Transfer to reserve account'
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
    const currency = pick(random, CURRENCY_TABLE)
    const incoming = isIncoming(random, category)
    const magnitude = amountFor(random, category, currency)
    let counterparty =
      category === 'Sales' || category === 'Refunds'
        ? pick(random, CUSTOMERS)
        : pick(random, COUNTERPARTIES[category])
    let description = descriptionFor(random, category, incoming, instant)
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
