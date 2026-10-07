import { expect, test } from 'vitest'
import { toFilters } from './api.ts'
import { viewerZone } from './dates.ts'
import { decodeView } from './url-state.ts'

test('sends calendar days to the API as UTC instants in the viewer zone', () => {
  expect(viewerZone).toBe('America/New_York')
  const view = decodeView('?from=2026-11-01&to=2026-11-01', viewerZone)
  expect(toFilters(view)).toMatchObject({
    from: '2026-11-01T04:00:00.000Z',
    to: '2026-11-02T05:00:00.000Z',
  })
})

test('reads shared dates in the zone of the link', () => {
  const view = decodeView('?from=2026-10-01&to=2026-10-31&tz=Asia/Tokyo', viewerZone)
  expect(toFilters(view)).toMatchObject({
    from: '2026-09-30T15:00:00.000Z',
    to: '2026-10-31T15:00:00.000Z',
  })
})
