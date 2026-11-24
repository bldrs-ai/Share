import {GLOBAL_ID_PATTERN} from './globalId'
import {namePathRef, occurrenceRef, parseRef} from '../visibilityRefs'


/**
 * The refs an edit op may name its targets with (create-300 L1, #1916;
 * design/new/model-edit.md §5). A subset of the permalink vocabulary in
 * `viewer/visibilityRefs.js`, minus the one kind a persisted log must not
 * hold:
 *
 *   g<GlobalId>     an IFC element — from the source file or created by the
 *                   log — by its 22-character `IfcRoot.GlobalId`
 *   o<id>.<id>…     a STEP occurrence (NAUO path, plus the solid). Valid only
 *                   over the exact source bytes it was recorded against: see
 *                   {@link isPortableEditRef} and model-edit.md §5.2
 *   n<seg>/<seg>…   a scene-graph node (GLB, OBJ, ADF…) by NavTree name path
 *
 * `e<expressID>` is refused. An expressID is a STEP line number: local to one
 * file and reassigned by any re-export, so a log keyed on it silently
 * re-targets the wrong element the first time the base model is re-authored
 * (#1916 thread). It is fine in a permalink and as a per-load resolution
 * cache (GlobalId → expressID → instances), never in an op.
 *
 * `batchId`s and the minted occurrence / geometry ids of `batchedEdit.js`
 * are not refs at all: they are per-load and three reuses them
 * (model-edit.md §5).
 */


/** Ref kinds an edit op accepts, by their one-letter prefix. */
export const EditRefKind = Object.freeze({
  GLOBAL_ID: 'g',
  OCCURRENCE: 'o',
  NAME_PATH: 'n',
})


/**
 * @param {string} globalId
 * @return {string} the `g` ref naming it
 */
export function globalIdRef(globalId) {
  return `g${globalId}`
}


/**
 * Parse one edit ref.
 *
 * @param {*} text
 * @return {object|null} `{kind: 'g', globalId}`, `{kind: 'o', ids}` or
 *   `{kind: 'n', segments}`; null when `text` is not a valid edit ref (see
 *   {@link editRefError} for why)
 */
export function parseEditRef(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return null
  }
  if (text[0] === EditRefKind.GLOBAL_ID) {
    const globalId = text.substring(1)
    return GLOBAL_ID_PATTERN.test(globalId) ? {kind: EditRefKind.GLOBAL_ID, globalId} : null
  }
  if (text[0] === EditRefKind.OCCURRENCE || text[0] === EditRefKind.NAME_PATH) {
    return parseRef(text)
  }
  return null
}


/**
 * Inverse of {@link parseEditRef}. A name path comes back canonical, so
 * `nMesh~1` parses and formats as `nMesh`; every other ref round-trips
 * character for character.
 *
 * @param {object} parsed
 * @return {string}
 */
export function formatEditRef(parsed) {
  switch (parsed?.kind) {
    case EditRefKind.GLOBAL_ID:
      return globalIdRef(parsed.globalId)
    case EditRefKind.OCCURRENCE:
      return occurrenceRef(parsed.ids)
    case EditRefKind.NAME_PATH:
      return namePathRef(parsed.segments)
    default:
      throw new TypeError(`formatEditRef: not an edit ref: ${JSON.stringify(parsed)}`)
  }
}


/**
 * Why `text` is not a valid edit ref, for a report a person or an agent can
 * act on.
 *
 * @param {*} text
 * @return {string|null} the reason, or null when it is valid
 */
export function editRefError(text) {
  if (parseEditRef(text) !== null) {
    return null
  }
  if (typeof text === 'string' && /^e\d+$/.test(text)) {
    return 'e<expressID> is not stable across re-exports of the source; name an IFC element by g<GlobalId>'
  }
  return 'not an edit ref: expected g<22-char GlobalId>, o<id>.<id>… (STEP occurrence) or n<seg>/<seg>… (name path)'
}


/**
 * Whether a ref survives a re-export of the source model.
 *
 * `g` and `n` do: a GlobalId and a node's name path are what the file
 * carries, and an authoring tool keeps them. `o` does not: a STEP occurrence
 * path is NAUO express ids, which a re-export renumbers just as it does IFC
 * express ids, and STEP has no GUID to fall back on. An `o` ref is therefore
 * **source-pinned**: correct over the exact source bytes it was recorded
 * against and over nothing else. L3 (#1918) must bind a log holding one to
 * the source's content key and refuse to replay it over any other source
 * (model-edit.md §5.2).
 *
 * @param {string} text a valid edit ref
 * @return {boolean}
 */
export function isPortableEditRef(text) {
  const kind = parseEditRef(text)?.kind
  return kind === EditRefKind.GLOBAL_ID || kind === EditRefKind.NAME_PATH
}
