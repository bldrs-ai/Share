import {useEffect} from 'react'
import useStore from '../../store/useStore'
import {resolvedAppearance} from '../../viewer/display/DisplayController'
import {createLiveTerm, setDisplayTerm} from '../Share/viewLink'
import {writeModelDisplayHash} from './displayHash'
import {writeVisibilityHash} from './visibilityHash'


/**
 * The display term of the live view link (Share/viewLink.js) for the model on
 * screen: once the user has changed the display themselves
 * (`viewLink.js#noteUserDisplayChange` — a Display menu choice, a hide or
 * unhide, isolation), the `#d:` token follows every change of the Display
 * menu's state and of what's hidden or isolated, in place, while the Share
 * dialog's "Display settings" switch (store `isDisplayInUrl`) is on.
 *
 * Mounted once, in CadView, rather than in a control: the user's display
 * actions are spread across the toolbar, the NavTree, the keyboard and the
 * Display menu, and the link has to follow all of them. A component of its
 * own, rendering nothing, so a hide re-renders this rather than all of
 * CadView. It replaces the VisibilityHashWriter, which wrote hide / isolate
 * from the moment the model was ready, whoever changed them, as history
 * entries, and regardless of the Share dialog's switch.
 *
 * Changes are read off the store (`displayOverrides`, `hiddenElements`,
 * `isolatedElements`, `isTempIsolationModeOn`), so the term sees every
 * change, its own user's or not, and writes nothing until the user's first.
 * A link's own `#d:` being applied on load (the Display menu seeding itself,
 * CadView's applyVisibilityHash) is therefore never written back, and an
 * Assist or widget-API hide is only followed once the user has made one.
 *
 * @return {null}
 */
export default function LiveDisplayLink() {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  useEffect(() => {
    if (!model) {
      return undefined
    }
    const term = createLiveTerm({
      write: () => writeLiveDisplay(model, viewer),
      isEnabled: () => useStore.getState().isDisplayInUrl,
    })
    setDisplayTerm(term)
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.displayOverrides !== prev.displayOverrides ||
          state.hiddenElements !== prev.hiddenElements ||
          state.isolatedElements !== prev.isolatedElements ||
          state.isTempIsolationModeOn !== prev.isTempIsolationModeOn) {
        term.changed()
      }
    })
    return () => {
      unsubscribe()
      // A change still settling lands in the link of the model it was made on.
      term.flush()
      setDisplayTerm(null)
    }
  }, [model, viewer])
  return null
}


/**
 * Write the whole `#d:` token from the current state, in place: the Display
 * menu's appearance, resolved off the override stack (the same source the
 * Share dialog writes from), then hide / isolate.
 *
 * @param {object} model
 * @param {object} viewer
 */
export function writeLiveDisplay(model, viewer) {
  const {displayOverrides} = useStore.getState()
  writeModelDisplayHash(window.location, resolvedAppearance(model, Object.values(displayOverrides)), {inPlace: true})
  writeVisibilityHash(window.location, viewer, {inPlace: true})
}
