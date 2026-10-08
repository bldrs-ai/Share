/**
 * The free tier's export allowance as a deploy shows it — the count line, the
 * charge headers, the ledger rows — read back into numbers and dates a live
 * spec can compare. For #1939's 2 free exports per rolling 7 days
 * (glb-export-premium.md §4.8 on that branch).
 *
 * The allowance's numbers are restated here, NOT imported from #1939's
 * `src/export/freeExports.js`. Partly because that file is not on main, but
 * mostly on purpose: this is the oracle the deploy is checked against, and a
 * check that imports the implementation's constants agrees with whatever the
 * implementation does. If the owner changes the allowance, this file changes
 * with it, in the same PR, as a visible decision.
 *
 * Free of any Playwright import, for `freeAllowance.test.js`.
 */


export const FREE_EXPORT_LIMIT = 2
export const FREE_EXPORT_WINDOW_DAYS = 7
const HOURS_PER_DAY = 24
const MS_PER_HOUR = 3_600_000
export const FREE_EXPORT_WINDOW_MS = FREE_EXPORT_WINDOW_DAYS * HOURS_PER_DAY * MS_PER_HOUR

/**
 * How the Export tab writes "next one <date>", which the spec re-creates IN
 * THE PAGE (same locale, same time zone) with `toLocaleString(undefined,
 * this)` and compares character for character — `formatNextFreeExport` on
 * #1939.
 */
export const NEXT_FREE_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

export type Allowance = {limit: number, used: number, remaining: number, nextFreeAt: string | null}
export type LedgerRow = {id?: string, free?: boolean, exportedAt?: string, key?: string | null,
  bytes?: number | null, format?: string}


/**
 * Read the line under a free user's Export button:
 * "1 of 2 free exports left this week", and at the limit
 * "0 of 2 free exports left this week · next one Thu, Oct 9, 9:00 AM".
 *
 * @param text the line's text content
 * @return the parts, or null when the text is not that line at all
 */
export function parseFreeRemainingCaption(text: string | null): {
  remaining: number, limit: number, next: string | null,
} | null {
  if (text === null) {
    return null
  }
  const match = text.trim().match(/^(\d+) of (\d+) free exports left this week(?: · next one (.+))?$/)
  if (match === null) {
    return null
  }
  return {remaining: Number(match[1]), limit: Number(match[2]), next: match[3] ?? null}
}


/**
 * Parse `X-Bldrs-Free-Exports`, the allowance after a charge, as `pro-module`
 * sends it. Throws on anything that is not a whole allowance: a header that
 * is present and malformed is a defect, not a missing feature.
 *
 * @param value the header's value
 * @return the allowance
 */
export function parseFreeExportsHeader(value: string | null | undefined): Allowance {
  if (value === null || value === undefined) {
    throw new Error('X-Bldrs-Free-Exports is missing')
  }
  const parsed = JSON.parse(value)
  const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0
  if (!parsed || !isCount(parsed.limit) || !isCount(parsed.used) || !isCount(parsed.remaining)) {
    throw new Error(`X-Bldrs-Free-Exports is not an allowance: ${value}`)
  }
  const nextFreeAt = parsed.nextFreeAt ?? null
  if (nextFreeAt !== null && !Number.isFinite(Date.parse(nextFreeAt))) {
    throw new Error(`X-Bldrs-Free-Exports has an unreadable nextFreeAt: ${value}`)
  }
  return {limit: parsed.limit, used: parsed.used, remaining: parsed.remaining, nextFreeAt}
}


/**
 * When the next free export frees up, worked out independently from the
 * ledger: the OLDEST free row still inside the window, plus the window. For
 * the spec's two exports that is the FIRST one's `exportedAt` + 7 days —
 * which is what the header, the caption and the help text must all say.
 *
 * @param rows `app_metadata.exports`, read from Auth0
 * @param now millis since epoch
 * @return ISO timestamp, or null when no free row counts
 */
export function expectedNextFreeAt(rows: LedgerRow[], now: number): string | null {
  const counted = rows
    .filter((row) => row.free === true && Number.isFinite(Date.parse(row.exportedAt ?? '')))
    .map((row) => Date.parse(row.exportedAt as string))
    .filter((at) => at + FREE_EXPORT_WINDOW_MS > now)
  return counted.length === 0 ? null : new Date(Math.min(...counted) + FREE_EXPORT_WINDOW_MS).toISOString()
}


/**
 * The help a free user sees on clicking the gated button at the limit.
 *
 * @param formattedDate the next free export, formatted in the page
 * @return the full sentence pair, as #1939's `freeLimitHelp` writes it
 */
export function freeLimitHelpText(formattedDate: string): string {
  return `You've used your ${FREE_EXPORT_LIMIT} free exports for the last ${FREE_EXPORT_WINDOW_DAYS} days. ` +
    `Your next free export is available ${formattedDate}.`
}


/**
 * The free charge rows a step added: in `after`, flagged `free`, and with an
 * id `before` did not have.
 *
 * @param before ledger before the step
 * @param after ledger after it
 * @return the new free rows, in `after`'s order (newest first)
 */
export function newFreeRows(before: LedgerRow[], after: LedgerRow[]): LedgerRow[] {
  const seen = new Set(before.map((row) => row.id))
  return after.filter((row) => row.free === true && !seen.has(row.id))
}
