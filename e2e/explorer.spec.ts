import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { Page as ResultPage, Summary } from '../src/domain.ts'

const FILTERS = 'currency=EUR&category=Fees'

async function getJson<T>(request: APIRequestContext, path: string) {
  const response = await request.get(path)
  expect(response.ok()).toBe(true)
  return (await response.json()) as T
}

const dataRows = (page: Page) => page.getByRole('row').filter({ has: page.getByRole('link') })
const count = (page: Page) =>
  page.getByRole('region', { name: 'Summary' }).getByRole('definition').first()

test('a shared link restores the rows, totals and transaction, and history keeps up', async ({
  page,
  request,
}) => {
  const [top] = (
    await getJson<ResultPage>(request, `/api/transactions?${FILTERS}&sort=-amount&limit=1`)
  ).items
  if (!top) throw new Error('Expected at least one EUR fee')
  const summary = await getJson<Summary>(request, `/api/summary?${FILTERS}`)

  await page.goto(`/?${FILTERS}&sort=-amount&tx=${top.id}`)
  await expect(page.getByRole('dialog', { name: top.counterparty })).toContainText(top.id)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(`/?${FILTERS}&sort=-amount`)
  await expect(dataRows(page).first().getByRole('link')).toHaveText(top.counterparty)
  await expect(count(page)).toHaveText(summary.count.toLocaleString('en-US'))

  await page.getByLabel('Currency').selectOption('GBP')
  await expect(page).toHaveURL('/?currency=GBP&category=Fees&sort=-amount')
  await expect(dataRows(page).first()).toContainText('£')
  await page.goBack()
  await expect(page.getByLabel('Currency')).toHaveValue('EUR')
  await expect(dataRows(page).first().getByRole('link')).toHaveText(top.counterparty)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/)
  const [header, ...lines] = (await readFile(await file.path(), 'utf8')).split('\r\n')
  expect(header).toBe('\uFEFFid,timestamp,counterparty,description,category,status,currency,amount')
  expect(lines.pop()).toBe('')
  expect(lines).toHaveLength(summary.count)
  expect(lines[0]?.startsWith(`${top.id},`)).toBe(true)
  expect(lines.filter((line) => !/,Fees,[A-Z]+,EUR,-?\d+\.\d{2}$/.test(line))).toEqual([])
})

test('a shared day means the same instants in every time zone', async ({ browser, baseURL }) => {
  const seen = []
  for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
    const context = await browser.newContext({ baseURL, locale: 'en-US', timezoneId })
    const page = await context.newPage()
    const summaryRequest = page.waitForRequest((request) => request.url().includes('/api/summary'))
    await page.goto('/?from=2026-03-08&to=2026-03-08&tz=America/New_York')
    const time = dataRows(page).first().locator('time')
    await expect(count(page)).toHaveText(/\d/)
    seen.push({
      query: new URL((await summaryRequest).url()).search,
      count: await count(page).textContent(),
      instant: await time.getAttribute('datetime'),
      shown: await time.textContent(),
      notes: await page.getByRole('note').allTextContents(),
    })
    await context.close()
  }

  const [newYork, tokyo] = seen
  expect(newYork?.query).toBe('?from=2026-03-08T05%3A00%3A00.000Z&to=2026-03-09T04%3A00%3A00.000Z')
  expect(tokyo?.query).toBe(newYork?.query)
  expect(tokyo?.count).toBe(newYork?.count)
  expect(tokyo?.instant).toBe(newYork?.instant)
  expect(tokyo?.shown).not.toBe(newYork?.shown)
  expect(newYork?.notes).toEqual([])
  expect(tokyo?.notes).toEqual(['Dates are days in America/New_York time'])
})
