import {HASH_DEBOUNCE_WAIT_MS} from '../../utils/debounce'
import {createLiveTerm} from '../Share/viewLink'


/**
 * The live camera link: once the user has moved the camera themselves, the
 * page's `#c:` token follows the camera for the rest of the session, so the
 * address bar is always a link to what they're looking at. Owner's call: a
 * receiver of a link then sees the camera feature at work and keeps sharing
 * with it, rather than having to find it in the Share dialog. It replaced
 * removing `#c:` on the first move (CameraControl's old canvas mouseup and
 * wheel handlers, the ViewCube's moves).
 *
 * Why it waits for the user's own move: before that, every camera move is
 * one the page made — the load's auto-framing and camera follow, a link's
 * `#c:` pose being applied, a note's camera. Writing those would put a token
 * into a plain model link nobody positioned (and rewrite a link's token
 * before its pose has even settled). renderDemand.js#noteUserCamera's
 * USER_CAMERA_EVENT isn't the gate: `setCameraFromParams` sends it for a
 * link's or a note's pose, which is the user's for the load's camera follow
 * but not a move of theirs here. The gate is camera-controls' own
 * input events — `controlstart` (a press) and `control` (a drag; a wheel zoom
 * sends only that), which it sends for input on its canvas alone — once the
 * camera actually moves under them (a click to select isn't a camera move),
 * plus USER_CAMERA_MOVE_EVENT from our camera UIs that move the camera with
 * no control event (the ViewCube). Other moves made for the user — a note's
 * camera, the Assist `view.*` tools — don't start it, and once it's live
 * they're followed like any other.
 *
 * The rule is the live view link's (Share/viewLink.js), shared with the cut
 * planes and the display: this module only says what the camera's user
 * change is, and the term does the rest.
 *
 * Once live, every camera `update` schedules a write, programmatic ones too
 * (a ViewCube snap, a note's camera, a fit): the link follows the camera,
 * whoever moved it. The write is debounced (utils/debounce.js) so it lands
 * once camera-controls' damping has settled, and goes through
 * `history.replaceState` (utils/location.js#replaceHashParams): no history
 * entry per settle, and no `hashchange`/`popstate` for the location effect to
 * re-apply the rounded pose from.
 */


/**
 * Sent on the viewer's camera-controls by a camera UI of ours when the user
 * moves the camera with it: see `noteUserCameraMove`.
 */
export const USER_CAMERA_MOVE_EVENT = 'bldrsusercameramove'


/**
 * The user moved the camera through a UI of ours that camera-controls sends
 * no control event for (a ViewCube drag, snap, orbit or view button), so the
 * live camera link starts. Not for a pose the page applies on the user's
 * behalf (a link's, a note's): those don't start it.
 *
 * @param {object|null} controls the viewer's camera-controls instance
 */
export function noteUserCameraMove(controls) {
  try {
    controls?.dispatchEvent?.({type: USER_CAMERA_MOVE_EVENT})
  } catch {
    // A controls stand-in without events: nothing is listening either.
  }
}


/**
 * Start watching `controls` for the user's first move; from then on, write
 * the camera into the link after each settle.
 *
 * @param {object} controls the viewer's camera-controls instance
 * @param {object} options
 * @param {function(object): void} options.write writes the pose of `controls`
 *   into the page's URL without a history entry
 *   (CameraControl.jsx#replaceCameraUrlParams)
 * @param {function(): boolean} [options.isEnabled] whether the camera belongs
 *   in the link right now: the Share dialog's "Camera position" switch
 *   (store `isCameraInUrl`). Read when a write is scheduled AND when it
 *   fires, so turning the switch off drops a write already pending, which
 *   would otherwise put back the token the dialog just removed.
 * @param {number} [options.waitMs]
 * @return {{isLive: function(): boolean, dispose: function(): void}}
 *   `dispose` stops listening and drops a pending write
 */
export function startLiveCameraLink(controls, {
  write,
  isEnabled = () => true,
  waitMs = HASH_DEBOUNCE_WAIT_MS,
}) {
  const term = createLiveTerm({write: () => write(controls), isEnabled, waitMs})
  // Input is under way on the canvas: a press (`controlstart`, until its
  // `controlend`) or a wheel zoom (`control` alone; it has no end).
  let isUserInput = false
  // The pose the press started from, to tell a press that moved the camera
  // from one that didn't.
  let pressPose = null
  const schedule = term.changed
  const goLive = () => {
    if (!term.isLive()) {
      term.start()
    }
  }
  // camera-controls sends `controlstart` on pointerDOWN, before any drag, so
  // a click or a double-click to select an element gets one too. That isn't
  // a camera move, and taking it for one put the load's framing into the
  // link of everyone who only picked an element. So user input starts the
  // link only once the camera MOVES under it: an `update` while the input is
  // under way (a drag, a wheel zoom's dolly)...
  const onUpdate = () => {
    if (isUserInput) {
      goLive()
    }
    schedule()
  }
  const onControlStart = () => {
    isUserInput = true
    pressPose = poseKey(controls)
  }
  const onControl = () => {
    isUserInput = true
  }
  // ...or a press that changed where the camera is heading by its release,
  // with no `update` in between: a flick inside one frame, or a paused render
  // loop (nothing calls the controls' update then). getPosition/getTarget
  // return the END of a move, so the change shows before any frame applies it.
  const onControlEnd = () => {
    if (pressPose !== null && poseKey(controls) !== pressPose) {
      goLive()
    }
    isUserInput = false
    pressPose = null
  }
  const events = [
    ['controlstart', onControlStart],
    ['control', onControl],
    ['controlend', onControlEnd],
    [USER_CAMERA_MOVE_EVENT, goLive],
    ['update', onUpdate],
  ]
  events.forEach(([type, fn]) => controls?.addEventListener?.(type, fn))
  return {
    isLive: term.isLive,
    dispose: () => {
      term.dispose()
      events.forEach(([type, fn]) => controls?.removeEventListener?.(type, fn))
    },
  }
}


/**
 * @param {object} controls
 * @return {string|null} where the camera is heading, comparable by value;
 *   null for controls without a pose
 */
function poseKey(controls) {
  const position = controls?.getPosition?.()
  const target = controls?.getTarget?.()
  if (!position || !target) {
    return null
  }
  return [position.x, position.y, position.z, target.x, target.y, target.z].join(',')
}
