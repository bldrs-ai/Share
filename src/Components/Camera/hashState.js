import {
  removeParamsFromHash as utilsRemoveParamsFromHash,
  removeHashParams,
} from '../../utils/location'


/** The prefix to use for the Camera state token */
export const HASH_PREFIX_CAMERA = 'c'


/**
 * @param {string} hash
 * @return {string} hash with camera params removed
 */
export function removeParamsFromHash(hash) {
  return utilsRemoveParamsFromHash(hash, HASH_PREFIX_CAMERA)
}


/** Removes camera params from the URL if present */
export function removeCameraUrlParams() {
  forgetSyncedCameraToken()
  removeHashParams(window.location, HASH_PREFIX_CAMERA)
}


/**
 * The `#c:` token last written into the page's URL or applied from it, and
 * the camera-controls it was for: what CameraControl.jsx#onLocation leaves
 * alone when a navigation carries it. Here rather than in CameraControl so
 * removing the token (removeCameraUrlParams, called by the Share dialog and
 * the notes) forgets it in the same step.
 *
 * @type {{controls: object|null, token: string|undefined}}
 */
const synced = {controls: null, token: undefined}


/**
 * @param {object} controls
 * @param {string|undefined} token the page's `c:` set, as now written
 */
export function noteCameraTokenSynced(controls, token) {
  synced.controls = controls
  synced.token = token
}


/**
 * @param {object} controls
 * @param {string} token
 * @return {boolean} whether `token` is the camera's already, for `controls`
 */
export function isCameraTokenSynced(controls, token) {
  return token !== undefined && synced.controls === controls && token === synced.token
}


/** The token has left the URL: the next one seen is applied. */
export function forgetSyncedCameraToken() {
  synced.controls = null
  synced.token = undefined
}
