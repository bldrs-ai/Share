/**
 * What of a load's state may reach Sentry (Share#2107). Used by every path
 * that sends it: the stall message and the load-failure exception
 * (`LoadProgressReporter#applySentryLoadState`) and the condition events of
 * `OPFS/reportOpfsSourceCondition.js` (Share#2103).
 */

// The only `contexts.load` fields these events carry. An allowlist, so a field
// a later change adds to the load state is withheld until someone decides it
// is safe. NOT here: `fileInfo` (the raw route path or URL, set in
// CadView.jsx from the filepath: for a private GitHub or external model it is
// the path), and anything else that could name the file. `report` is the
// Sentry copy of the load report (model line withheld, privacy/
// sentryRedaction.js), the same text CadView's exception carries.
const LOAD_CONTEXT_FIELDS = ['phase', 'completed', 'total', 'unit', 'elapsedMs', 'memoryMb', 'report']

/**
 * A load's capture context minus anything that identifies the
 * model: `load.*` tags (phase only) and the allowlisted `load` fields.
 *
 * @param {{tags: object, contexts: object}} load LoadProgressReporter#sentryLoadState()
 * @return {{tags: object, contexts: object}}
 */
export function nonIdentifyingLoadContext(load) {
  const tags = {}
  for (const [key, value] of Object.entries(load?.tags ?? {})) {
    if (key === 'load.phase') {
      tags[key] = value
    }
  }
  const source = load?.contexts?.load
  if (!source) {
    return {tags, contexts: {}}
  }
  const loadContext = {}
  for (const field of LOAD_CONTEXT_FIELDS) {
    if (source[field] !== undefined) {
      loadContext[field] = source[field]
    }
  }
  return {tags, contexts: {load: loadContext}}
}
