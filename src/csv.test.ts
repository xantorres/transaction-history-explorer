import { expect, test } from 'vitest'
import { CSV_HEADER, csvCell, transactionCsvRow } from './csv.ts'
import type { Transaction } from './domain.ts'

test.each([
  ['=1+2', "'=1+2"],
  ['+44 20 7946 0958', "'+44 20 7946 0958"],
  ['-2+3', "'-2+3"],
  ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
  ['\tTab-led reference', "'\tTab-led reference"],
  ['\rReturn-led', `"'\rReturn-led"`],
  [
    '=HYPERLINK("https://example.com/refund","Claim refund")',
    `"'=HYPERLINK(""https://example.com/refund"",""Claim refund"")"`,
  ],
  ['Acme;=1+2;', "Acme;'=1+2;"],
  ['Acme\t@SUM(A1:A9)', "Acme\t'@SUM(A1:A9)"],
  ['Acme\n-2+3', `"Acme\n'-2+3"`],
  ['\t=1+2', "'\t'=1+2"],
])('neutralises a formula in %j', (value, cell) => {
  expect(csvCell(value)).toBe(cell)
})

test.each(['-12.50', '0', '1500', '7.5'])('keeps the number %j numeric', (value) => {
  expect(csvCell(value)).toBe(value)
})

test.each([
  ['Smith, Jones & Partners', '"Smith, Jones & Partners"'],
  ['"Quoted" Holdings Ltd', '"""Quoted"" Holdings Ltd"'],
  ['Line one\nLine two', '"Line one\nLine two"'],
  ['Crème Brûlée Café', 'Crème Brûlée Café'],
  ['', ''],
])('quotes %j only when it has to', (value, cell) => {
  expect(csvCell(value)).toBe(cell)
})

test('starts the file with a byte order mark and the header', () => {
  expect(CSV_HEADER).toBe(
    '\uFEFFid,timestamp,counterparty,description,category,status,currency,amount\r\n',
  )
})

test('writes a transaction as one CRLF-terminated row with a decimal amount', () => {
  const row: Transaction = {
    id: 'tx_0a1b2c3d',
    timestamp: '2026-03-08T23:10:00-04:00',
    counterparty: 'Smith, Jones & Partners',
    description: '=1+2',
    amount: -1250,
    currency: 'EUR',
    category: 'Fees',
    status: 'PENDING',
  }
  expect(transactionCsvRow(row)).toBe(
    `tx_0a1b2c3d,2026-03-08T23:10:00-04:00,"Smith, Jones & Partners",'=1+2,Fees,PENDING,EUR,-12.50\r\n`,
  )
  expect(transactionCsvRow({ ...row, amount: 1500, currency: 'JPY' })).toMatch(/,JPY,1500\r\n$/)
})
