import {getHashParams, getObjectParams} from '../../utils/location'
import {occurrenceElementPathIds, resolveElementPathOccurrence} from '../../utils/occurrencePaths'
import {
  applyHiddenDiff,
  diffHidden,
  elementRef,
  occurrenceRef,
  parseRef,
  sceneGraphNamePaths,
} from '../../viewer/visibilityRefs'
import {HASH_PREFIX_DISPLAY, mergeDisplayTerms} from './displayHash'


/**
 * visibilityHash — hide and isolate state in the `#d:` permalink token
 * (#1250, design/new/model-display-controls.md §6.3), next to the Display
 * menu's `color` / `wire` / `res`:
 *
 *   #d:hide=e1234+e5678                  IFC: two elements hidden
 *   #d:hide=o1020254.367733              STEP: one occurrence hidden
 *   #d:hide=nUpper%20Jaw/teeth/Tooth_07  ADF: one tooth hidden
 *   #d:show=nUpper%20Jaw/facc            ADF: a default-hidden overlay shown
 *   #d:iso=e1234                         isolating one element
 *   #d:color=src,hide=e12,iso=e34        with display terms
 *
 * Each term is a `+`-separated list of refs; visibilityRefs.js has the ref
 * vocabulary and how `hide` / `show` diff the hidden set against the loader's
 * defaults. `+` is free: `,` separates terms, and ref segments are
 * percent-escaped.
 *
 * A link with none of these terms leaves visibility alone when it loads, so a
 * model reloaded in place (a theme change) keeps what the user had.
 */


/** The `#d:` keys this module owns. */
export const VISIBILITY_KEYS = ['hide', 'show', 'iso']

/**
 * Past this many characters of visibility terms the link carries none of
 * them (§6.2's cap), rather than a partial state that looks complete.
 */
export const VISIBILITY_TERMS_MAX_CHARS = 1500

const LIST_SEP = '+'


/**
 * The refs describing the viewer's current hide / isolate state.
 *
 * @param {object} viewer ShareViewer, or null
 * @return {{hide: Array<string>, show: Array<string>, iso: Array<string>}}
 */
export function visibilityRefs(viewer) {
  const refs = {hide: [], show: [], iso: []}
  const isolator = viewer?.isolator
  const model = isolator?.ifcModel
  if (!model) {
    return refs
  }
  const names = isolator._isSceneGraphModel() ? sceneGraphNamePaths(model) : null
  const refOf = (id) => names?.refOf(id) ?? elementRef(id)
  const {hide, show} = diffHidden({
    childrenOf: isolator.spatialStructure,
    hiddenIds: isolator.hiddenIds,
    defaultHiddenIds: isolator.defaultHiddenIds,
    elementIds: isolator.visualElementsIds,
  })
  refs.hide = hide.map(refOf)
  refs.show = show.map(refOf)
  for (const {occurrencePath, solidExpressId} of isolator.hiddenOccurrencePaths.values()) {
    // The root is the selection permalink's first id; this token has no root.
    refs.hide.push(occurrenceRef(occurrenceElementPathIds(0, occurrencePath, solidExpressId).slice(1)))
  }
  if (isolator.tempIsolationModeOn) {
    refs.iso = isolator.isolatedIds.map(refOf)
  }
  return refs
}


/**
 * @param {{hide: Array<string>, show: Array<string>, iso: Array<string>}} refs
 * @return {object} `#d:` terms, key → value, '' for an empty list
 */
export function visibilityTerms(refs) {
  return Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, (refs[key] ?? []).join(LIST_SEP)]))
}


/**
 * @param {object} terms from {@link visibilityTerms}
 * @return {boolean} true when the terms fit the link
 */
export function visibilityTermsFit(terms) {
  const length = Object.entries(terms)
    .reduce((sum, [key, value]) => sum + (value ? key.length + 1 + value.length : 0), 0)
  return length <= VISIBILITY_TERMS_MAX_CHARS
}


/**
 * Write the viewer's hide / isolate state into `#d:`, leaving the display
 * terms as they are. Past the size cap the visibility terms are dropped. A
 * no-op until the isolator has a model.
 *
 * @param {object} location window.location
 * @param {object} viewer ShareViewer
 * @return {boolean} false when the state was too large for the link
 */
export function writeVisibilityHash(location, viewer) {
  // No model in the isolator yet: nothing to describe, and writing the empty
  // state would strip an incoming link's terms before they were applied.
  if (!viewer?.isolator?.ifcModel) {
    return true
  }
  const terms = visibilityTerms(visibilityRefs(viewer))
  const fits = visibilityTermsFit(terms)
  if (!fits) {
    console.warn('visibilityHash: hidden / isolated state is too large for the link; leaving it out')
  }
  mergeDisplayTerms(location, fits ? terms : Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, null])))
  return fits
}


/**
 * Read the visibility terms from `#d:`.
 *
 * @param {object} location window.location
 * @return {{hide: Array<string>, show: Array<string>, iso: Array<string>}|null}
 *   null when the token has none of them
 */
export function readVisibilityHash(location) {
  const token = getHashParams(location, HASH_PREFIX_DISPLAY)
  const obj = token ? getObjectParams(token) : {}
  if (!VISIBILITY_KEYS.some((key) => typeof obj[key] === 'string')) {
    return null
  }
  return Object.fromEntries(VISIBILITY_KEYS.map((key) => [
    key, typeof obj[key] === 'string' ? obj[key].split(LIST_SEP).filter(Boolean) : [],
  ]))
}


/**
 * Apply a link's hide / isolate terms to the loaded model. A no-op when the
 * link has none. Refs that don't resolve against this model are skipped and
 * returned, so a stale or hand-edited link applies what it can.
 *
 * Call once the model, its NavTree root and the isolator are ready, and
 * after any in-place hidden-state reapply (`CadView#onViewer`), which this
 * replaces.
 *
 * @param {object} location window.location
 * @param {object} viewer ShareViewer
 * @param {object|null} rootElement the NavTree root, for STEP occurrence refs
 * @return {Array<string>} refs that didn't resolve
 */
export function applyVisibilityHash(location, viewer, rootElement) {
  const refs = readVisibilityHash(location)
  const isolator = viewer?.isolator
  const model = isolator?.ifcModel
  if (!refs || !model) {
    return []
  }
  const names = isolator._isSceneGraphModel() ? sceneGraphNamePaths(model) : null
  const unresolved = []
  const resolveId = (text) => {
    const ref = parseRef(text)
    const id = ref?.kind === 'e' ? ref.id : (ref?.kind === 'n' && names ? names.idOf(ref.segments) : null)
    if (id === null || id === undefined) {
      unresolved.push(text)
      return null
    }
    return id
  }
  const occurrences = []
  const hideIds = []
  for (const text of refs.hide) {
    if (text.startsWith('o')) {
      const occurrence = resolveOccurrence(viewer, rootElement, parseRef(text))
      if (occurrence) {
        occurrences.push(occurrence)
      } else {
        unresolved.push(text)
      }
      continue
    }
    const id = resolveId(text)
    if (id !== null) {
      hideIds.push(id)
    }
  }
  const showIds = refs.show.map(resolveId).filter((id) => id !== null)
  const isoIds = refs.iso.map(resolveId).filter((id) => id !== null)
  const hidden = applyHiddenDiff({
    childrenOf: isolator.spatialStructure,
    hide: hideIds,
    show: showIds,
    defaultHiddenIds: isolator.defaultHiddenIds,
    elementIds: isolator.visualElementsIds,
  })

  // Start from nothing hidden or isolated, then build the link's state.
  isolator.resetTempIsolation()
  isolator.unHideAllElements()
  if (hidden.length > 0) {
    isolator.hideElementsById(hidden)
  }
  for (const {nodeId, instanceIds, occurrencePath, solidExpressId} of occurrences) {
    isolator.hideOccurrence(nodeId, instanceIds, {occurrencePath, solidExpressId})
  }
  if (isoIds.length > 0) {
    isolator.isolateElementsById(isoIds)
  }
  if (unresolved.length > 0) {
    console.warn('visibilityHash: refs not found in this model:', unresolved.join(' '))
  }
  return unresolved
}


/**
 * Resolve an `o` ref the way the selection permalink resolves its element
 * path (`resolveElementPathOccurrence`), down to the instances to hide.
 *
 * @param {object} viewer
 * @param {object|null} rootElement
 * @param {object|null} ref parsed `o` ref
 * @return {object|null} `{nodeId, instanceIds, occurrencePath, solidExpressId}`
 */
function resolveOccurrence(viewer, rootElement, ref) {
  if (ref?.kind !== 'o' || typeof viewer.getInstanceIdsForOccurrencePath !== 'function') {
    return null
  }
  const instancesAt = (path, geometryExpressId, includeDescendants) =>
    viewer.getInstanceIdsForOccurrencePath(0, path, {includeDescendants, geometryExpressId})
  const {node, occurrencePath, solidExpressId} = resolveElementPathOccurrence({
    rootNode: rootElement,
    eltPathIds: ref.ids,
    hasGeometryAtPath: (path, geometryExpressId) => instancesAt(path, geometryExpressId, false).length > 0,
  })
  if (!occurrencePath) {
    return null
  }
  // Keyed like the NavTree eye (`HideToggleButton`'s `elementId`), so the
  // row's eye reads hidden: the solid when a body is meant, else the
  // occurrence's own node.
  const instanceIds = instancesAt(occurrencePath, solidExpressId, true)
  if (instanceIds.length === 0) {
    return null
  }
  return {
    nodeId: solidExpressId ?? Number(node.expressID),
    instanceIds,
    occurrencePath,
    solidExpressId,
  }
}
