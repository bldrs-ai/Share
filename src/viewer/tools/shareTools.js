import {addCameraUrlParams} from '../../Components/Camera/CameraControl'
import {writeModelDisplayHash} from '../../Components/Residency/displayHash'
import {writeVisibilityHash} from '../../Components/Residency/visibilityHash'
import useStore from '../../store/useStore'
import {resolvedAppearance} from '../display/DisplayController'


/**
 * The `share` tool provider: v0 has `share.permalink` (ai-workspace.md §9).
 * Share-side, and Share's own (not View's): permalinks are the app shell's.
 */


/**
 * A location-shaped `{hash}` that normalizes assignments the way
 * `window.location.hash` does (a leading '#'), so the hash writers can
 * compose onto a copy.
 *
 * @param {string} initial
 * @return {{hash: string}}
 */
function hashDouble(initial) {
  let value = initial
  return {
    get hash() {
      return value
    },
    set hash(next) {
      value = next && !next.startsWith('#') ? `#${next}` : next
    },
  }
}


/**
 * The link to the current view: the page URL (model path, plus the
 * selection's element path and `#sel:` token, which the selection writers
 * keep current) with what the Share dialog adds on open — the camera `#c:`,
 * and the `#d:` display and hide / isolate terms.
 *
 * Composed on a copy of the hash: the page's URL is left as it is, which is
 * what makes this tool `readOnly`. (The Share dialog writes those tokens
 * into the live URL instead, because its text field and QR code render
 * `window.location`.) Cut planes aren't composed here — their writer
 * (`addPlanesToHashState`) only writes the live URL, and the live hash
 * already carries an active cut's `#cp:` token.
 *
 * @return {string}
 */
export function currentPermalink() {
  const {viewer, model, cameraControls, displayOverrides} = useStore.getState()
  const location = hashDouble(window.location.hash)
  const controls = viewer?.context?.getCameraControls?.() ?? cameraControls
  if (controls) {
    addCameraUrlParams(controls, location)
  }
  if (model) {
    writeModelDisplayHash(location, resolvedAppearance(model, Object.values(displayOverrides ?? {})))
    writeVisibilityHash(location, viewer)
  }
  const {origin, pathname, search} = window.location
  return `${origin}${pathname}${search}${location.hash}`
}


/**
 * @return {object} the `share` ToolProvider
 */
export function createShareToolProvider() {
  const tools = [{
    name: 'share.permalink',
    description:
      'The shareable URL of the current view: the model, camera, selection, and hidden or isolated ' +
      'elements. Opening it shows what the user sees now. Does not change the view.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnly: true},
    run: () => Promise.resolve().then(() => ({
      content: {url: currentPermalink()},
      echo: 'Made a link to this view',
    })),
  }]
  return {id: 'share', tools: () => tools}
}
