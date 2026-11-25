import {uploadedDisplayFileName} from '../loader/uploadedFileName'
import {MODEL_ROUTE_KINDS, modelRouteSource} from '../privacy/analytics'
import {modelNamesOf} from '../privacy/sentryRedaction'
import modelIdentity from '../routes/modelIdentity'
import {selectReadModel} from '../store/IFCSlice'
import useStore from '../store/useStore'
import {roundCoord} from '../utils/math'
import {nodeName, nodeType, nodesById, refMaker} from '../viewer/tools/refs'
import {elementRef} from '../model/visibilityRefs'
import {
  FEEDBACK_FORMAT,
  MAX_REF_CHARS,
  MAX_SELECTED_REF_CHARS,
  MAX_SELECTION_REFS,
  MAX_SELECTION_TYPES,
  MAX_TYPE_CHARS,
} from './feedbackRecord'


/**
 * What the user was looking at when they gave feedback: the model, the
 * camera and the selection, as structured fields (design/tracks/community-t100/feedback.md
 * §"Record"). Every source sends it; a screenshot, when the user attaches
 * one, is separate (captureScreenshot.js).
 *
 * The model is named only when it is one of Share's own hosted files
 * (route kind `project`), which are public by construction; any other
 * model's ref is withheld, since the page can't tell a private GitHub repo
 * or a signed URL from a public one (quotas.md §"GitHub privacy detection"
 * is a server call). Selected elements of such a model are sent as their
 * `e<id>` refs, never the name paths a scene graph's refs are made of.
 *
 * @param {object} [state] the store's
 * @return {{view: object, isPublic: boolean, names: Array<string>}} the
 *   snapshot, whether the model is named in it, and the names to withhold
 *   from the record's text when it isn't
 */
export function feedbackView(state = useStore.getState()) {
  const route = state.modelPath ?? null
  const {source = null, routeKind = null} = modelRouteSource(route)
  const isPublic = routeKind === MODEL_ROUTE_KINDS.PROJECT
  const model = selectReadModel(state)
  const rawFormat = model?.format ?? model?.type ?? null
  const format = typeof rawFormat === 'string' && FEEDBACK_FORMAT.test(rawFormat) ? rawFormat : null
  const {rootElement, viewer} = state
  const anchors = (state.selectedAnchorIds ?? []).map(Number).filter(Number.isFinite)
  const refOf = isPublic ? refMaker(viewer) : elementRef
  const nodes = rootElement ? nodesById(rootElement) : new Map()
  const types = {}
  for (const id of anchors) {
    const type = String(nodeType(nodes.get(id)) || 'unknown').slice(0, MAX_TYPE_CHARS)
    if (type in types || Object.keys(types).length < MAX_SELECTION_TYPES) {
      types[type] = (types[type] ?? 0) + 1
    }
  }
  const names = isPublic || !route ? [] : modelNamesOf(route, [
    rootElement ? nodeName(rootElement) : null,
    // An upload's route holds only its storage UUID: its real name is looked
    // up the way Loader looks it up for the root label.
    routeKind === MODEL_ROUTE_KINDS.LOCAL ? uploadedDisplayFileName(String(route.filepath ?? '')) : null,
  ].filter(Boolean))
  return {
    isPublic,
    names,
    view: {
      model: {route_kind: routeKind, source, format,
        ref: isPublic && route ? modelIdentity(route).slice(0, MAX_REF_CHARS) : null},
      camera: cameraOf(state.cameraControls),
      selection: {
        count: anchors.length,
        refs: anchors.slice(0, MAX_SELECTION_REFS).map((id) => String(refOf(id)).slice(0, MAX_SELECTED_REF_CHARS)),
        types,
      },
    },
  }
}


/**
 * @param {object|null} controls camera-controls, the store's
 * @return {?{position: Array<number>, target: Array<number>}} rounded as the
 *   `#c:` link rounds them (CameraControl.jsx cameraUrlParams), or null
 */
function cameraOf(controls) {
  try {
    const position = controls?.getPosition?.()
    const target = controls?.getTarget?.()
    if (!position || !target) {
      return null
    }
    const point = (v) => roundCoord(v.x, v.y, v.z).map(Number)
    const camera = {position: point(position), target: point(target)}
    return [...camera.position, ...camera.target].every(Number.isFinite) ? camera : null
  } catch {
    // roundCoord throws on a non-finite coordinate: no camera to report.
    return null
  }
}
