import {HASH_DEBOUNCE_WAIT_MS, debounceInHistoryEntry} from '../../utils/debounce'


/**
 * The live view link: one rule for every piece of view state the page's link
 * carries — the camera (`#c:`), the cut planes (`#cp:`), and the display
 * (`#d:`: the Display menu, what's hidden or isolated, a volume's window).
 *
 * The rule, from the camera's (Share#2175): a term is dormant until the
 * user's own first change of it, then the link follows every change of it,
 * whoever makes it, for the rest of the session. So the address bar is always
 * a link to what the user is looking at, and someone who receives a link sees
 * the feature at work.
 *
 * Why it waits for the user: until then, every change is one the page made —
 * the load's framing, a link's own terms being applied, a note's camera.
 * Writing those would put terms into a plain model link nobody
 * set up, or rewrite a link's terms before they were even applied (the
 * Display menu seeds itself from `#d:` when the model loads, and an early
 * write would strip the token first).
 *
 * How it writes: debounced (utils/debounce.js), so a drag or a camera's damping
 * lands once it settles; in place, through `history.replaceState`
 * (utils/location.js#replaceHashParams, #replaceHash), so Back doesn't step
 * through every settle and no `hashchange`/`popstate` re-applies the written
 * terms; and only while the Share dialog's switch for the term is on (store
 * `isCameraInUrl`, `isPlaneInUrl`, `isDisplayInUrl`), read when a write is
 * scheduled AND when it fires, so turning a switch off drops a write already
 * pending. A write still pending when the page moves to another history entry
 * is dropped rather than written into that entry.
 *
 * What counts as the user's change is each term's to say, since the signals
 * differ: camera-controls input that actually moved the camera
 * (Camera/liveCameraLink.js), a cut plane's drag (CutPlaneMenu.jsx), a Display
 * menu choice or a hide / isolate, by hand or through an Assist tool the user
 * asked (`noteUserDisplayChange`). Those are discrete, so they are written at
 * once (`commit`), not once they settle: a reload or a copied address right
 * after the click has them. Note the change AFTER making it. User actions that
 * are a step of their own — turning a cut plane on or off, the Share dialog's
 * switches, a note's camera — still push a history entry, as before; they
 * don't start a term.
 */


/**
 * One term of the live view link.
 *
 * @param {object} options
 * @param {function(): void} options.write writes the term's current value
 *   into the page's URL in place (no history entry)
 * @param {function(): boolean} [options.isEnabled] whether the term belongs
 *   in the link right now: its Share-dialog switch
 * @param {number} [options.waitMs] debounce
 * @return {{start: function(): void, commit: function(): void, changed: function(): void,
 *   isLive: function(): boolean, flush: function(): void, dispose: function(): void}}
 *   `start` is the user's own change in progress: the term goes live and its
 *   value is written once it settles. `commit` is a discrete one, written at
 *   once. `changed` is any change: written only once live. `dispose` drops a
 *   pending write.
 */
export function createLiveTerm({write, isEnabled = () => true, waitMs = HASH_DEBOUNCE_WAIT_MS}) {
  let isLive = false
  let isDisposed = false
  // Lands only in the history entry the change was made in: a Back, a
  // Forward or an in-app open (open-205, #2021: with `?feature=spaModelNav`
  // they stay in this document) can make another entry the page's within
  // the debounce, and this value isn't that entry's. `flush` (a component
  // going away as the viewer is replaced) is dropped the same way
  // (utils/debounce.js#debounceInHistoryEntry).
  const writeSettled = debounceInHistoryEntry(() => {
    if (!isDisposed && isEnabled()) {
      write()
    }
  }, waitMs)
  const changed = () => {
    if (isLive && !isDisposed && isEnabled()) {
      writeSettled()
    }
  }
  return {
    start: () => {
      isLive = true
      changed()
    },
    // A discrete change of the user's (a click, a key, a slider let go): live,
    // and written now rather than once it settles, since there is nothing to
    // settle. A reload or a copy of the address straight after it has it. A
    // drag or the camera's damping keeps `start`, called on every move.
    commit: () => {
      isLive = true
      writeSettled.cancel()
      if (!isDisposed && isEnabled()) {
        write()
      }
    },
    changed,
    isLive: () => isLive,
    // Write a pending change now (a component going away mid-settle).
    flush: () => writeSettled.flush(),
    dispose: () => {
      isDisposed = true
      writeSettled.cancel()
    },
  }
}


// The display term of the model on screen, set by `useLiveDisplayLink`
// (Residency/liveDisplayLink.js). A module slot rather than store state: the
// user's display actions are spread over the toolbar, the NavTree, keyboard
// shortcuts and the Display menu, and each only needs to say "that was me".
let displayTerm = null


/**
 * Register the display term for the model on screen, replacing (and
 * disposing) any earlier one.
 *
 * @param {object|null} term from {@link createLiveTerm}, or null to clear
 */
export function setDisplayTerm(term) {
  if (displayTerm && displayTerm !== term) {
    displayTerm.dispose()
  }
  displayTerm = term
}


/**
 * The user changed what the model looks like themselves: a Display menu
 * choice, a hide or unhide, isolation on or off — by hand, or by asking the
 * assistant for it (an Assist `view.*` visibility tool, which runs only on
 * the user's request). The display term goes live and the link follows the
 * display from now on. Not for a change the page makes by itself (a link's
 * `#d:` applied on load, a note's view).
 */
export function noteUserDisplayChange() {
  displayTerm?.commit()
}
