const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export const formatDate = (t: number) => dateFmt.format(t)
export const formatDateTime = (t: number) => dateTimeFmt.format(t)

/** "Just now", "12 minutes ago", "Yesterday, 4:05 PM", then the date. */
export function formatWhen(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000)
  if (s < 45) return 'Just now'
  if (s < 3600) return rel.format(-Math.round(s / 60), 'minute')
  if (s < 6 * 3600) return rel.format(-Math.round(s / 3600), 'hour')
  const day = (d: number) => new Date(d).toDateString()
  if (day(t) === day(now)) return `Today, ${timeFmt.format(t)}`
  if (day(t) === day(now - 86_400_000)) return `Yesterday, ${timeFmt.format(t)}`
  return dateTimeFmt.format(t)
}
