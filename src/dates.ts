const offsetFormats = new Map<string, Intl.DateTimeFormat>()

export function zoneOffset(timeZone: string, instant: number) {
  let format = offsetFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    offsetFormats.set(timeZone, format)
  }
  const name = format.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value
  const [, sign, hours = '0', minutes = '0'] = /([+-])(\d{2}):(\d{2})/.exec(name ?? '') ?? []
  const offset = Number(hours) * 60 + Number(minutes)
  return sign === '-' ? -offset : offset
}

const MINUTE = 60_000
const DAY = 86_400_000

export function zonedDayStart(date: string, timeZone: string) {
  const midnight = Date.parse(`${date}T00:00:00Z`)
  const candidates = [midnight - DAY, midnight + DAY].map(
    (instant) => midnight - zoneOffset(timeZone, instant) * MINUTE,
  )
  const isMidnight = (instant: number) =>
    instant + zoneOffset(timeZone, instant) * MINUTE === midnight
  // A daylight saving jump at midnight skips 00:00, so the day starts at the jump.
  return candidates.find(isMidnight) ?? Math.max(...candidates)
}

export const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10)

export function isIsoDate(value: string) {
  const instant = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value
}

export function canonicalZone(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

export const viewerZone = new Intl.DateTimeFormat().resolvedOptions().timeZone

const dateTime = new Intl.DateTimeFormat(navigator.language, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const formatDateTime = (iso: string) => dateTime.format(Date.parse(iso))

const wallClock = new Intl.DateTimeFormat(navigator.language, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

export const formatOriginalTime = (iso: string) =>
  `${wallClock.format(Date.parse(`${iso.slice(0, 19)}Z`))} UTC${iso.slice(19)}`
