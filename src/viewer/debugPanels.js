import {isFeatureEnabled} from '../FeatureFlags'
import {isPerfVisible, setPerfVisible} from '../utils/PerfMonitor'


/**
 * The debug panels: Perf (FPS / ms / MB graphs and the renderer's counts,
 * utils/PerfMonitor.js) and Render (the look-tuning panel, LightingGui),
 * side by side in the debug dock (Components/DebugDock/DebugDock.jsx).
 * Kept in prod: the backtick key shows or hides both together, and the
 * Display menu's "Render..." opens Render alone. `?feature=look` opens both
 * at startup; `?feature=perf` Perf alone, as before.
 *
 * Perf's shown state lives in PerfMonitor; Render's lives here, outside the
 * viewer, because a theme change re-creates the viewer (CadView's theme
 * listener) and the new one should come up as the old one was. The dock
 * mounts the Render panel into itself for whichever viewer is current.
 */

export const DEBUG_PANELS_KEY = '`'

let renderShown = null
const listeners = new Set()


/** @return {boolean} whether the Render panel is shown */
export function isRenderPanelShown() {
  if (renderShown === null) {
    renderShown = isFeatureEnabled('look')
  }
  return renderShown
}


/**
 * Show or hide the Render panel.
 *
 * @param {boolean} shown
 */
export function setRenderPanelShown(shown) {
  shown = shown === true
  if (shown === isRenderPanelShown()) {
    return
  }
  renderShown = shown
  listeners.forEach((fn) => fn())
}


/**
 * Subscribe to the Render panel's show/hide (for `useSyncExternalStore`).
 *
 * @param {Function} fn
 * @return {Function} unsubscribe
 */
export function subscribeRenderPanel(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}


/**
 * Show or hide both panels: hide them if either is up, else show both.
 *
 * @return {boolean} whether the panels are now shown
 */
export function toggleDebugPanels() {
  const show = !(isPerfVisible() || isRenderPanelShown())
  setPerfVisible(show)
  setRenderPanelShown(show)
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
 * typing in a field (a note, search, the assistant's chat, a Render panel
 * number), with a modifier held, and on key repeat.
 *
 * @param {object} [win] the window to listen on
 * @return {Function} removes the listener
 */
export function installDebugPanelsShortcut(win = window) {
  const onKeyDown = (event) => {
    if (event.key !== DEBUG_PANELS_KEY || event.repeat ||
        event.ctrlKey || event.metaKey || event.altKey ||
        isTypingTarget(event.target)) {
      return
    }
    event.preventDefault()
    toggleDebugPanels()
  }
  win.addEventListener('keydown', onKeyDown)
  return () => win.removeEventListener('keydown', onKeyDown)
}


/** Test-only: forget the Render panel state so the URL is read again. */
export function resetDebugPanelsForTest() {
  renderShown = null
}
