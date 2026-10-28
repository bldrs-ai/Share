/**
 * The free tier's export rule as a deploy shows it — the slot line, the
 * `X-Bldrs-Model-Slots` header, the `usageQuota.loads` rows — read back into
 * numbers and dates a live spec can compare. For the slot rule of 2026-10-27
 * (glb-export-premium.md §4.8): a free user exports any model holding one of
 * their 2 model slots as often as they like, and a model holding none takes a
 * slot on its first export.
 *
 * The rule's numbers and wording are restated here, NOT imported from
 * `src/export/exportSlots.js` or `ExportSection.jsx`, on purpose: this is the
 * oracle the deploy is checked against, and a check that imports the
 * implementation's constants agrees with whatever the implementation does. If
 * the owner changes the rule, this file changes with it, in the same PR, as a
 * visible decision.
 *
 * Free of any Playwright import, for `freeAllowance.test.js`.
 */


export const FREE_MODEL_SLOTS = 2
export const SLOT_WINDOW_DAYS = 7
const HOURS_PER_DAY = 24
const MS_PER_HOUR = 3_600_000
export const SLOT_WINDOW_MS = SLOT_WINDOW_DAYS * HOURS_PER_DAY * MS_PER_HOUR

/**
 * How the Export tab writes "next one frees up <date>", which the spec
 * re-creates IN THE PAGE (same locale, same time zone) with
 * `toLocaleString(undefined, this)` and compares character for character —
 * `exportSlots.js#formatNextFreeSlot`.
 */
export const NEXT_FREE_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

export type SlotsHeader = {limit: number, used: number, remaining: number, nextFreeAt: string | null, taken: boolean}
export type SlotRow = {key?: string, loadedAt?: string, via?: string}
export type LedgerRow = {id?: string, free?: boolean, exportedAt?: string, key?: string | null,
  bytes?: number | null, format?: string}


/** The slot line for a model that already holds a slot. */
export const HELD_CAPTION =
  `This model holds one of your ${FREE_MODEL_SLOTS} free model slots: export it as often as you like`


/**
 * @param remaining slots free
 * @return the slot line for a model holding no slot while one is free
 */
export function takeCaption(remaining: number): string {
  return `Exporting takes one of your ${FREE_MODEL_SLOTS} free model slots (${remaining} left this week),` +
    ' then export it as often as you like'
}


/**
 * @param formattedDate the next free slot, formatted in the page
 * @return the slot line when every slot holds another model
 */
export function fullCaption(formattedDate: string): string {
  return `Your ${FREE_MODEL_SLOTS} free model slots this week hold other models · next one frees up ${formattedDate}`
}


/**
 * @param formattedDate the next free slot, formatted in the page
 * @return the slots-full gate's help, as `ExportSection#slotsFullHelp` writes it
 */
export function slotsFullHelpText(formattedDate: string): string {
  return `Your ${FREE_MODEL_SLOTS} free model slots for the last ${SLOT_WINDOW_DAYS} days hold other models.` +
    ' A model with a slot exports as often as you like; this one needs a free slot.' +
    ` Your next slot frees up ${formattedDate}.`
}


/**
 * Parse `X-Bldrs-Model-Slots`, the slots after a free delivery, as
 * `pro-module` sends it. Throws on anything that is not a whole slots
 * statement: a header that is present and malformed is a defect, not a
 * missing feature.
 *
 * @param value the header's value
 * @return the slots
 */
export function parseSlotsHeader(value: string | null | undefined): SlotsHeader {
  if (value === null || value === undefined) {
    throw new Error('X-Bldrs-Model-Slots is missing')
  }
  const parsed = JSON.parse(value)
  const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0
  if (!parsed || !isCount(parsed.limit) || !isCount(parsed.used) || !isCount(parsed.remaining) ||
      typeof parsed.taken !== 'boolean') {
    throw new Error(`X-Bldrs-Model-Slots is not a slots statement: ${value}`)
  }
  const nextFreeAt = parsed.nextFreeAt ?? null
  if (nextFreeAt !== null && !Number.isFinite(Date.parse(nextFreeAt))) {
    throw new Error(`X-Bldrs-Model-Slots has an unreadable nextFreeAt: ${value}`)
  }
  return {limit: parsed.limit, used: parsed.used, remaining: parsed.remaining, nextFreeAt, taken: parsed.taken}
}


/**
 * The slots held at `now`, worked out independently from the ledger: rows
 * with a key and a stamp inside the window.
 *
 * @param rows `app_metadata.usageQuota.loads`, read from Auth0
 * @param now millis since epoch
 * @return the held rows
 */
export function heldSlots(rows: SlotRow[], now: number): SlotRow[] {
  return rows.filter((row) => typeof row.key === 'string' &&
    Number.isFinite(Date.parse(row.loadedAt ?? '')) && Date.parse(row.loadedAt as string) + SLOT_WINDOW_MS > now)
}


/**
 * When the next slot frees up: the OLDEST held slot plus the window — what
 * the header, the slot line and the gate's help must all say.
 *
 * @param rows `app_metadata.usageQuota.loads`
 * @param now millis since epoch
 * @return ISO timestamp, or null when no slot is held
 */
export function expectedNextFreeSlot(rows: SlotRow[], now: number): string | null {
  const held = heldSlots(rows, now).map((row) => Date.parse(row.loadedAt as string))
  return held.length === 0 ? null : new Date(Math.min(...held) + SLOT_WINDOW_MS).toISOString()
}


/**
 * The history rows a step added: in `after`, with an id `before` did not have.
 *
 * @param before `app_metadata.exports` before the step
 * @param after the same, after it
 * @return the new rows, in `after`'s order (newest first)
 */
export function newRows(before: LedgerRow[], after: LedgerRow[]): LedgerRow[] {
  const seen = new Set(before.map((row) => row.id))
  return after.filter((row) => !seen.has(row.id))
}
