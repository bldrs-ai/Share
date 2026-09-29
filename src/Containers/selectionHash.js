import {getHashParams, removeHashParams, setParamsToHash} from '../utils/location'
import {elementRef, parseRef, sceneGraphNamePaths} from '../viewer/visibilityRefs'


/**
 * selectionHash — a multi-selection in the permalink, as `#sel:<ref>,<ref>…`.
 *
 * A single selection rides the URL path (`…/index.ifc/81/621`, or a STEP
 * occurrence's path — see `selectItemsInScene`), and that carries exactly
 * one element, so a shared link used to reopen with only the first of a
 * multi-selection highlighted. This token lists every selected row, in the
 * ref vocabulary the `#d:` hide / isolate terms use (visibilityRefs.js):
 *
 *   #sel:e621,e396                          IFC elements, or STEP rows (NAUO ids)
 *   #sel:nUpper%20Jaw/teeth/Tooth_07,n…     scene-graph rows, by NavTree name path
 *
 * STEP rows are written by id: a multi-selection is keyed by row, and a
 * row's NAUO id is stable in the file. (`selectItemsInScene` resolves the
 * rows back to their occurrences' instances for the highlight.)
 *
 * Written for two or more rows; one row is normally the path's job. The path
 * keeps naming the first pick, so a link still opens on something selected
 * where this token is dropped or doesn't resolve. A single row is written too
 * when the path names a different element — a shift-click that dropped the
 * path's own element from a multi-selection leaves the path on it — or the
 * path would win and restore the element that was deselected.
 */


/** The prefix for the selection token. */
export const HASH_PREFIX_SELECTION = 'sel'

/** Past this many characters the list is left out, and the path alone remains. */
export const SELECTION_MAX_CHARS = 1500


/**
 * @param {object} viewer ShareViewer
 * @return {object|null} name-path addressing for a scene-graph model, else null
 */
function namePaths(viewer) {
  const isolator = viewer?.isolator
  return isolator?.ifcModel && isolator._isSceneGraphModel() ?
    sceneGraphNamePaths(isolator.ifcModel) : null
}


/**
 * @param {Array<number|string>} anchorIds the selected rows
 * @param {object} viewer ShareViewer
 * @return {Array<string>} a ref per row
 */
export function selectionRefs(anchorIds, viewer) {
  const names = namePaths(viewer)
  return anchorIds.map(Number).filter(Number.isFinite)
    .map((id) => names?.refOf(id) ?? elementRef(id))
}


/**
 * Write the selection's rows to `#sel:`, or drop the token when the path
 * carries the selection (or it's too long to fit). A no-op until the isolator
 * has a model, so an incoming link's token isn't stripped before it was read.
 *
 * @param {object} location window.location
 * @param {object} viewer ShareViewer
 * @param {Array<number|string>} anchorIds the selected rows
 * @param {boolean} [pathNamesSelection] whether the URL path names a single
 *   selection's row (then the token isn't needed for it)
 */
export function writeSelectionHash(location, viewer, anchorIds, pathNamesSelection = true) {
  if (!viewer?.isolator?.ifcModel) {
    return
  }
  const count = anchorIds?.length ?? 0
  const needed = count >= 2 || (count === 1 && !pathNamesSelection)
  const refs = needed ? selectionRefs(anchorIds, viewer) : []
  if (refs.length === 0 || refs.join(',').length > SELECTION_MAX_CHARS) {
    if (getHashParams(location, HASH_PREFIX_SELECTION)) {
      removeHashParams(location, HASH_PREFIX_SELECTION)
    }
    return
  }
  // Positional params (no names): the refs, comma-joined.
  const hash = setParamsToHash(
    location.hash, HASH_PREFIX_SELECTION, Object.fromEntries(refs.map((ref, i) => [i, ref])))
  if (hash !== location.hash) {
    location.hash = hash
  }
}


/**
 * @param {object} location window.location
 * @return {Array<string>|null} the token's refs, or null without one
 */
export function readSelectionHash(location) {
  const token = getHashParams(location, HASH_PREFIX_SELECTION)
  if (!token) {
    return null
  }
  const refs = token.substring(`${HASH_PREFIX_SELECTION}:`.length).split(',').filter(Boolean)
  return refs.length > 0 ? refs : null
}


/**
 * Resolve the token's refs to row ids on the loaded model. Refs that don't
 * resolve are dropped; the caller checks the ids against the tree.
 *
 * @param {Array<string>} refs
 * @param {object} viewer ShareViewer
 * @return {Array<number>}
 */
export function resolveSelectionRefs(refs, viewer) {
  const names = namePaths(viewer)
  const ids = []
  for (const text of refs) {
    const ref = parseRef(text)
    const id = ref?.kind === 'e' ? ref.id : (ref?.kind === 'n' && names ? names.idOf(ref.segments) : null)
    if (id !== null && id !== undefined) {
      ids.push(id)
    }
  }
  return ids
}
