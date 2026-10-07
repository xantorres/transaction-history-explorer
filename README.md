# Transaction History Explorer

A fast, shareable search over 100,000 transactions. Every filter, the sort order and the open transaction live in the URL, so support can send a customer a link that opens exactly the same view, and the totals always come from the server for the whole result rather than from whichever rows happen to be loaded.

## Quick start

You'll need Node 24 (there's an `.nvmrc`).

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The mock API runs inside the Vite dev server, so there's nothing else to start.

| Command                            | What it does                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`                      | App and mock API on port 5173, with a footer for simulating failures                         |
| `npm test`                         | Unit and component tests (Vitest, React Testing Library, jsdom)                              |
| `npm run lint`                     | ESLint, the Prettier check and `tsc -b`                                                      |
| `npm run test:e2e`                 | Installs Chromium if it's missing, builds, serves the build on port 4173 and runs Playwright |
| `npm run verify`                   | Lint, unit tests and end-to-end tests, which is what CI runs                                 |
| `npm run build`, `npm run preview` | The production build, and serving it together with the mock API                              |

## Requirements

| Requirement                                                                                                | Where                                                                                                                                          | Proved by                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100,000 transactions, cursor pagination, server-side sort and filter, 200 to 800 ms latency                | [`server/data.ts`](server/data.ts), [`server/store.ts`](server/store.ts), [`server/api.ts`](server/api.ts)                                     | [`server/*.test.ts`](server)                                                                                                                       |
| Virtualized infinite table with a header that stays put                                                    | [`TransactionTable.tsx`](src/components/TransactionTable.tsx)                                                                                  | [`App.test.tsx`](src/App.test.tsx) for the rows and paging, the browser for the header                                                             |
| Date, amount, currency, status, category and debounced text filters, all in the URL, with back and forward | [`url-state.ts`](src/url-state.ts), [`FilterBar.tsx`](src/components/FilterBar.tsx), [`DebouncedInput.tsx`](src/components/DebouncedInput.tsx) | [`url-state.test.ts`](src/url-state.test.ts), [`filters.test.tsx`](src/filters.test.tsx)                                                           |
| Count and in and out per currency, computed by the server                                                  | `/api/summary`, [`SummaryBar.tsx`](src/components/SummaryBar.tsx)                                                                              | [`summary.test.tsx`](src/summary.test.tsx)                                                                                                         |
| Detail drawer with a deep link, pending distinct from booked                                               | [`TransactionDrawer.tsx`](src/components/TransactionDrawer.tsx), [`StatusBadge.tsx`](src/components/StatusBadge.tsx)                           | [`drawer.test.tsx`](src/drawer.test.tsx), [e2e](e2e/explorer.spec.ts)                                                                              |
| Chunked CSV export that doesn't freeze the UI                                                              | [`export.ts`](src/export.ts), [`ExportButton.tsx`](src/components/ExportButton.tsx)                                                            | [`export.test.tsx`](src/export.test.tsx)                                                                                                           |
| Loading, empty, error and partial-failure states without layout jumps                                      | the components above, [`DevFaults.tsx`](src/components/DevFaults.tsx)                                                                          | [`states.test.tsx`](src/states.test.tsx), [`summary.test.tsx`](src/summary.test.tsx)                                                               |
| TanStack Query with caching and cancellation, and no stale response winning                                | [`api.ts`](src/api.ts)                                                                                                                         | "abandons the request of a superseded search" and "a slow earlier search never replaces a newer one" in [`filters.test.tsx`](src/filters.test.tsx) |
| Dates shown in the viewer's zone and sent to the API in UTC                                                | [`dates.ts`](src/dates.ts), `toFilters` in [`api.ts`](src/api.ts)                                                                              | [`api.test.ts`](src/api.test.ts), [`dates.test.ts`](src/dates.test.ts), [e2e](e2e/explorer.spec.ts)                                                |
| CSV safe against formula injection                                                                         | [`csv.ts`](src/csv.ts)                                                                                                                         | [`csv.test.ts`](src/csv.test.ts)                                                                                                                   |

## Architecture

```
 location.search  <--- push / replace --- filters, sort headers, rows, drawer
        |
        |  useSyncExternalStore + typed codec            src/url-state.ts
        v
      View ---toFilters---> Filters with UTC instants    src/api.ts
        |
        +--> ['transactions', filters, sort]  useInfiniteQuery --> TransactionTable
        +--> ['summary', filters]             useQuery         --> SummaryBar, export total
        +--> ['transaction', id]              useQuery         --> TransactionDrawer
        +--> exportCsv(filters, sort)         5,000-row pages  --> Blob --> download
                        |
                        |  fetch(url, { signal })
                        v
   /api/*   createApi: (Request) => Promise<Response>         server/api.ts
            createStore: presorted orders, keyset cursors     server/store.ts
            generateTransactions(100_000) from a fixed seed   server/data.ts
```

A small Vite plugin in [`vite.config.ts`](vite.config.ts) mounts the handler on the dev and preview servers, and the component tests stub `fetch` onto the same handler, so the code the browser talks to is the code the tests talk to.

| Endpoint                                                                             | Returns                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `GET /api/transactions?q&from&to&min&max&currency&status&category&sort&cursor&limit` | `{ items, nextCursor }`, 100 rows by default and at most 5,000 |
| `GET /api/summary?<the same filters>`                                                | `{ count, perCurrency: [{ currency, in, out, pending }] }`     |
| `GET /api/transactions/:id`                                                          | One transaction, or a 404                                      |

`from` and `to` are UTC instants (the start is inclusive and the end exclusive), `min` and `max` bound the absolute amount in each row's own currency, and `q` matches the counterparty, description and ID while ignoring case and accents. Amounts are integers in the currency's minor unit. Bad input, a malformed cursor included, gets a 400 with `{ error: { code, message, param } }`, and a cursor from a different query is rejected rather than quietly paging the wrong result. `HEAD` works wherever `GET` does and any other method on an API route gets a 405 with an `Allow` header. Every response waits 200 to 800 ms, and the wait ends early when the request is aborted.

## Decisions and trade-offs

### The URL is the state store

I wanted a shared link to carry the whole view, so the view lives only in `location.search`. `useSyncExternalStore` subscribes to it, and a typed codec decodes it, drops anything it can't use and writes the parameters back in one canonical order, so two people looking at the same view always have the same link. Sort headers push a history entry, and so does the first pick in a select, while later picks in the same visit replace it. The text, date and amount inputs commit after 300 ms, pushing on the first commit after focus or after Back and replacing on the ones that follow, so a burst of typing is one step back rather than ten, and nothing commits while an input method is still composing. A half-typed date or an amount that doesn't parse is flagged under its field and never replaces the value already applied, a range whose ends are the wrong way round is flagged at both ends, and Clear filters wipes drafts that never applied along with the filters. Opening a row pushes an entry marked in `history.state`, so closing it steps back and Forward reopens it, but closing a drawer that arrived on a shared link replaces the URL instead of navigating out of the app.

I didn't add a router, because there's one route and its search parameters would still need this codec, and I didn't mirror a store into the URL, because two sources of truth eventually disagree.

### TanStack Query for server state and TanStack Virtual for rows

The list, the summary and the detail are each one query keyed by exactly what they depend on. `fetch` gets the query's abort signal, so changing a filter cancels the request in flight, and even a response that slipped through would land in its own key's cache entry rather than the one on screen. One test checks that a superseded search's request is aborted, and the race test lets an old search ignore its abort and answer after a newer one, then checks that the late response was read but never shows. `keepPreviousData` keeps the current rows on screen, dimmed, while the next result loads, and failed requests are retried once unless they're a 4xx, because a bad request won't get better. A result counts as fresh for a minute, and once the table moves on from it the cache keeps only its first page, because a result always comes back scrolled to the top, so returning to it later reloads one page rather than every page that was scrolled through, at the price of fetching the later pages again on the way back down.

RTK Query would have brought Redux along for nothing else, and fetching by hand would have meant rewriting caching, deduplication and cancellation. TanStack Virtual is small and headless, which suits the div-based ARIA table I wanted.

### A mock API that behaves like a real one

json-server can't do keyset cursors, server-side totals or accent-insensitive search, and MSW would add a dependency and, in the browser, a service worker for what one handler and a `fetch` stub already do. The data comes from a fixed seed over a fixed two-year window, so a shared link opens the same rows tomorrow and after a restart. About 0.5% of rows carry hostile text such as formula prefixes, quotes, commas, newlines and a script tag, and the names include accents and Japanese, so the CSV guard and the rendering meet awkward data in the browser and not only in unit tests. The rest should read like a real company's books: each payee only bills for what it sells, salaries, rent and taxes are paid in the currency of the office, refunds carry credit note numbers and no invoice number is used twice.

### Keyset pagination over presorted orders

At startup the store sorts every row once for each of the four sort orders. A cursor is the last row's sort key and ID plus a fingerprint of the query, encoded as base64url, and the next page binary-searches to that position, so pages never skip or repeat rows when amounts or times tie, and a cursor can't be replayed against a different filter. Filtering is a linear scan from the cursor, which is fine for 100,000 rows, and a real backend would keep the same cursor shape over an index per sort key.

### Money in integer minor units

Amounts are integers in each currency's minor unit, with the number of digits taken from `Intl` (so yen has none), and they only become decimals as exact strings for display and CSV, so no amount that's shown, filtered or exported is ever rounded by floating point. Amount filters apply to the absolute value in the row's own currency and round inward when a currency can't hold the fraction. Sorting by amount ranks rows by what they're worth in euros, at the fixed rates the mock data was generated with, so ¥10,000 sorts next to €62.50 rather than above €9,000. The filters stay on face value, because a bound you type should mean what the row says.

### Totals that mean something

The count includes every match, but in and out only add up booked transactions. Pending is a separate net figure for each currency because it can still change, and reversed transactions are counted but never summed because the money came back. The summary lives at `/api/summary` rather than under `/api/transactions/`, because there it would have shadowed a transaction with the ID `summary`, which is a bug I hit and fixed.

### Dates that survive being shared

Each timestamp keeps the offset it was recorded with, and the table shows it in the viewer's zone while the drawer shows both. Date filters are calendar days, and the URL stores them together with the zone they were picked in (`tz`), so the client turns them into UTC instants from midnight on the first day to midnight after the last day in that zone, daylight saving included. A link sent from Nicosia to Tokyo therefore means the same instants and the same totals, and the viewer in Tokyo gets a note naming the zone the days are in. Raw instants in the URL would have worked too but made links unreadable, and reading the days in each viewer's own zone would have given one link different totals.

### The table and the drawer

The table is a div-based ARIA table with a fixed row height, so the virtualizer never measures, and the next page loads once the rendered rows come within 20 of the end. The header sits outside the scrolling body with `scrollbar-gutter: stable` on both, so it stays put by layout rather than `position: sticky` and the virtualizer's offsets stay simple. `aria-rowcount` comes from the summary and the sorted column's header carries `aria-sort`, so assistive technology knows the size and order of the result even though only a slice is in the DOM. Each counterparty is a real link to the URL with that transaction open, so Cmd-click opens a new tab. Pending rows are muted and italic with a clock badge, and reversed rows have their amount struck through.

The drawer is a native `<dialog>` opened with `showModal`, so focus, Escape and the inert background come from the browser. It shows the row from the cached list page straight away while the server confirms it, keeps showing it with a Retry if that request fails, and has its own states for loading, not found and errors.

### Export without freezing

Export walks the result in 5,000-row pages using the filters and sort from the moment of the click, turns each page into one CSV string and assembles the file as a `Blob` from those parts, so there's never one giant string to build or copy. Export does nothing on an empty result, progress shows rows against the summary count, Cancel aborts the request in flight, and a failure says so and lets you start again. A full 100,000-row export in the browser took about 11 seconds (20 requests at the mock's latency), produced a file of about 10.8 MB and recorded no long tasks while I kept scrolling. I didn't reach for a Web Worker, because the wait is the network rather than the CPU, or the File System Access API, because it's Chromium-only and adds a file picker. With a real backend I'd rather the server produced the file.

The file follows RFC 4180 with CRLF line endings and starts with a byte order mark so Excel reads it as UTF-8. A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front unless the whole cell is a plain number, so `-12.50` stays a number while `-2+3` and `=HYPERLINK(...)` become text. Spreadsheets in locales that split cells on `;` also start a formula after a `;`, a tab or a line break inside a cell, so those get the same treatment.

### States

The first load shows skeleton rows, a new result dims the current rows under a thin progress bar while it loads, and the summary is a fixed-height strip with its own skeleton and error, so nothing below it moves. An empty result offers Clear filters, a failed list offers Retry, a failed next page keeps the loaded rows and retries inline, and a failed summary leaves the table working. Each failure is announced, a new match count is read out with its label, and Retry and the empty result's Clear filters move focus to whatever reloads, the table, the totals or the drawer's heading, or for a failed next page the last row that loaded, because the button itself is about to go away. Clear filters with no filter set and Export CSV on an empty result say so to assistive technology but stay focusable, so pressing either never drops the keyboard back to the top of the page. On the dev server a footer can fail each endpoint by setting a cookie the mock API reads, which is how I checked every one of these states in the browser. The preview server ignores the cookie, and the footer's code isn't in the production build.

## Testing

The component tests render the whole app against the real handler through the stubbed `fetch`, with the latency at zero and the option to hold any request open, which is how the cancel and progress tests control their timing, while the race test swaps in its own slow `fetch`. Vitest pins `TZ` to America/New_York so the date tests mean something, and Playwright runs Chromium against the production build with the locale and time zone pinned.

- Server: deterministic data, every filter, keyset paging through ties in both directions, cursor mismatch, summary semantics, routes, errors and abortable latency.
- Units: money, dates across daylight saving changes, the URL codec and CSV escaping.
- Components: URL sync with back and forward, one history entry per burst of typing or visit to a select, input method composition, drafts that can't apply, the race, paging and what a revisit reloads, sorting, canonical URLs, the summary, the drawer, export, and every failure state with where focus lands after Retry.
- End to end: a shared link with filters and an open transaction restores the same rows, totals and drawer, history keeps up and the exported file matches the filters; and the same shared day sends the same UTC instants from New York and Tokyo.

That's 186 Vitest tests and 2 Playwright tests. For the tests that guard the important behaviour I also broke the code on purpose, for example by dropping the abort signal or always pushing history entries, and checked that the right test failed.

## Bundle size

The production build is 92.67 kB of JavaScript, 3.05 kB of CSS and 0.45 kB of HTML, gzipped. The runtime dependencies are React, React DOM, TanStack Query and TanStack Virtual, and dates and money are formatted with `Intl` rather than a library.

## Known limits

- Amount inputs accept `,` or `.` as the decimal point but no grouping separators, so `1,000` reads as one.
- Each select filters on one value at a time.
- Amount sort converts at fixed rates rather than live ones.
- A failed export starts again from the beginning.
- In development React's StrictMode mounts twice, so the first list and summary requests go out twice and the first copies are cancelled.
- TanStack Query pauses retries while the tab is hidden, so a background tab can sit on a skeleton until it's visible again.

## With more time

- Resume a failed export from the last cursor instead of starting over.
- Multi-select for currency, status and category.
- Back the API with Postgres, keeping the same keyset cursors over an index per sort key, with trigram search and totals from an aggregate rather than a scan.
- Add axe accessibility checks and visual regression to the Playwright run.
- Parse amounts in the viewer's locale, grouping separators included.
- Stream very large exports straight to disk where the browser allows it, or generate them on the server.

If I had to keep one decision as this grew, it would be the URL as the only state, because everything that makes a link from support trustworthy follows from it.
