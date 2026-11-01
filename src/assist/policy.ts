import {Policy, ToolAnnotations} from './types'


/**
 * How a tool call may proceed, derived from its annotations
 * (ai-workspace.md §9, "Approval policy is derived from annotations"):
 *
 *   mutatesDocument | external | sendsPixels  → 'confirm'      (approval card / opt-in)
 *   viewState                                 → 'runWithUndo'  (runs; the step is undoable)
 *   readOnly                                  → 'run'          (runs freely)
 *   nothing                                   → 'confirm'
 *
 * Precedence is strictest-first, so a tool annotated both `readOnly` and
 * `external` — a contradiction, but a provider can write one — asks rather
 * than runs. Unannotated tools ask too: a tool that didn't say what it does is
 * treated as one that might do anything.
 *
 * @param annotations
 * @return the policy
 */
export function policyFor(annotations: ToolAnnotations | undefined): Policy {
  const a = annotations ?? {}
  if (a.mutatesDocument || a.external || a.sendsPixels) {
    return 'confirm'
  }
  if (a.viewState) {
    return 'runWithUndo'
  }
  if (a.readOnly) {
    return 'run'
  }
  return 'confirm'
}
