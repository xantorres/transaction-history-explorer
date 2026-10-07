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
