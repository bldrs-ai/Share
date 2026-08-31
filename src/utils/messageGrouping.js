/**
 * Normalization for the grouping keys Share computes itself, rather than
 * letting Sentry derive them.
 *
 * Two call sites share this, for the same reason: `loadProgress`'s
 * `diagnosticsTitle` (a `captureMessage`'s text *is* its grouping key) and
 * `alertTracking#trackAlert` (an explicit fingerprint). Keeping the rule in
 * one place is what keeps an alert and the load diagnostics that describe the
 * same underlying condition from grouping by two different rules.
 */


/**
 * Collapse each run of digits — and an entity marker the text already spelled
 * `#` — to a single `#`.
 *
 * Both call sites carry per-instance numbers inside otherwise fixed text:
 * engine diagnostics are per-entity ("Error processing representation #1234")
 * and the unknown-upload alert carries the file's byte size ("File upload of
 * unknown type: type() size(180384)"). Left raw, each distinct value opens its
 * own Sentry issue and the family is invisible.
 *
 * The pass is deliberately indiscriminate: it also collapses digits inside
 * identifiers, so "IFC4" normalizes to "IFC#" and "Revit 2024" to "Revit #".
 * That costs nothing for grouping — schema and authoring tool ride on the
 * event's own tags and context — and exempting them would reopen the
 * per-value split this exists to close.
 *
 * @param {string} text
 * @return {string}
 */
export function normalizeMessageDigits(text) {
  return text.replace(/#?\d+/g, '#')
}
