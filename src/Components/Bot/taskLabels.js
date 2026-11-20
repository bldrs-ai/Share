/**
 * What the task chip says while a tool call is running. The finished line is
 * the tool's own `echo` (assist/types.ts `ToolResult`); a call that has not
 * returned has none, so the panel names it here, in the present progressive,
 * to match the echoes' past tense ("Read the spatial structure"). The
 * registry carries only model-facing descriptions, not UI wording.
 */
const RUNNING_LABELS = {
  'model.query': 'Finding elements…',
  'model.properties': 'Reading properties…',
  'model.spatial': 'Reading the spatial structure…',
  'model.quantities': 'Reading quantities…',
  'model.measure': 'Measuring…',
  'share.permalink': 'Making a link…',
  'view.select': 'Selecting…',
  'view.isolate': 'Isolating…',
  'view.hide': 'Hiding…',
  'view.showAll': 'Showing everything…',
  'view.focus': 'Framing the view…',
}


/**
 * @param {string} name a registry tool name, e.g. 'model.spatial'
 * @return {string} the running task's label; a tool with no entry gets a generic one
 */
export function runningLabel(name) {
  return RUNNING_LABELS[name] ?? `Running ${name}…`
}
