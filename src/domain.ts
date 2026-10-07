export const CURRENCIES = ['EUR', 'GBP', 'JPY', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]

export const STATUSES = ['PENDING', 'BOOKED', 'REVERSED'] as const
export type Status = (typeof STATUSES)[number]

export const CATEGORIES = [
  'Fees',
  'Marketing',
  'Payroll',
  'Refunds',
  'Rent',
  'Sales',
  'Software',
  'Suppliers',
  'Taxes',
  'Transfers',
  'Travel',
] as const
export type Category = (typeof CATEGORIES)[number]

export const SORTS = ['-date', 'date', '-amount', 'amount'] as const
export type Sort = (typeof SORTS)[number]

export interface Transaction {
  id: string
  timestamp: string
  counterparty: string
  description: string
  amount: number
  currency: Currency
  category: Category
  status: Status
}

export interface Page {
  items: Transaction[]
  nextCursor: string | null
}

export interface CurrencyTotals {
  currency: Currency
  in: number
  out: number
  pending: number
}

export interface Summary {
  count: number
  perCurrency: CurrencyTotals[]
}

export interface ApiErrorBody {
  error: { code: string; message: string; param?: string }
}
