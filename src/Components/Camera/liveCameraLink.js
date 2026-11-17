import {HASH_DEBOUNCE_WAIT_MS, debounce} from '../../utils/debounce'


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
 * `controlstart` (drag) and `control` (a wheel zoom sends only that), which
 * it sends for input on its canvas alone, plus USER_CAMERA_MOVE_EVENT from
 * our camera UIs that move the camera with no control event (the ViewCube).
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
  let isLive = false
  const writeSettled = debounce(() => {
    if (isEnabled()) {
      write(controls)
    }
  }, waitMs)
  const onUpdate = () => {
    if (isLive && isEnabled()) {
      writeSettled()
    }
  }
  const onUserMove = () => {
    if (!isLive) {
      isLive = true
      // A move whose `update`s all landed before this event (none today, but
      // nothing promises the order) still gets written.
      onUpdate()
    }
  }
  const events = [
    ['controlstart', onUserMove],
    ['control', onUserMove],
    [USER_CAMERA_MOVE_EVENT, onUserMove],
    ['update', onUpdate],
  ]
  events.forEach(([type, fn]) => controls?.addEventListener?.(type, fn))
  return {
    isLive: () => isLive,
    dispose: () => {
      writeSettled.cancel()
      events.forEach(([type, fn]) => controls?.removeEventListener?.(type, fn))
    },
  }
}
