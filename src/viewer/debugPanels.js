import {isFeatureEnabled} from '../FeatureFlags'
import {isPerfVisible, setPerfVisible} from '../utils/PerfMonitor'


/**
 * The debug panels: the look-tuning panel (LightingGui, a lil-gui overlay
 * built by ShareViewer) and the FPS / ms / MB overlay (utils/PerfMonitor.js,
 * docked in the bottom bar). Kept in prod, behind the backtick key, which
 * shows or hides both together. `?feature=look` opens both at startup;
 * `?feature=perf` the overlay alone, as before.
 *
 * Whether the look panel is wanted lives here, not on the viewer, because a
 * theme change re-creates the viewer (CadView's theme listener) and the new
 * one should come up as the old one was. The overlay's state lives in
 * PerfMonitor, which outlives viewers already.
 */

export const DEBUG_PANELS_KEY = '`'

let lookPanelWanted = null


/** @return {boolean} whether the look panel should be shown */
export function isLookPanelWanted() {
  if (lookPanelWanted === null) {
    lookPanelWanted = isFeatureEnabled('look')
  }
  return lookPanelWanted
}


/**
 * Show or hide both panels: hide them if either is up, else show both.
 *
 * @param {object|null} viewer the current ShareViewer, or null before one
 *   exists (the overlay still toggles; the look panel follows the next one)
 * @return {boolean} whether the panels are now shown
 */
export function toggleDebugPanels(viewer) {
  const show = !(isPerfVisible() || isLookPanelWanted())
  lookPanelWanted = show
  setPerfVisible(show)
  viewer?.setLookPanelVisible?.(show)
  return show
}


/**
 * @param {EventTarget|null} target
 * @return {boolean} whether a keypress there is someone typing
 */
function isTypingTarget(target) {
  if (!target || typeof target !== 'object') {
    return false
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}


/**
 * Listen for the backtick key on `win` and toggle the panels. Ignored while
 * typing in a field (a note, search, the assistant's chat), with a modifier
 * held, and on key repeat.
 *
 * @param {Function} getViewer returns the current ShareViewer or null
 * @param {object} [win] the window to listen on
 * @return {Function} removes the listener
 */
export function installDebugPanelsShortcut(getViewer, win = window) {
  const onKeyDown = (event) => {
    if (event.key !== DEBUG_PANELS_KEY || event.repeat ||
        event.ctrlKey || event.metaKey || event.altKey ||
        isTypingTarget(event.target)) {
      return
    }
    event.preventDefault()
    toggleDebugPanels(getViewer())
  }
  win.addEventListener('keydown', onKeyDown)
  return () => win.removeEventListener('keydown', onKeyDown)
}


/** Test-only: forget the look-panel state so the URL is read again. */
export function resetDebugPanelsForTest() {
  lookPanelWanted = null
}
