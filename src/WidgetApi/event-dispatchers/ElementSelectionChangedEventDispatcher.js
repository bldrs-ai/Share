import ApiEventDispatcher from './ApiEventDispatcher'
import Utils from '../Utils'
import useStore from '../../store/useStore'
import {unsortedArraysAreEqual} from '../../utils/arrays'

/**
 * class ElementSelectionChangedEventDispatcher
 */
class ElementSelectionChangedEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.SelectionChanged'
  utils = null
  apiConnection = null

  /**
   * constructor
   *
   * @param {object} apiConnection AbstractApiConnection
   * @param {object} searchIndex SearchIndex
   */
  constructor(apiConnection, searchIndex) {
    super()
    this.apiConnection = apiConnection
    this.utils = new Utils(searchIndex)
  }

  /**
   * initialize dispatcher.
   *
   */
  initDispatch() {
    let lastSelectedElementGlobalIds = []
    useStore.subscribe((state, previousState) => {
      // NOTE: Currently this subscribe is being triggered on random unrelated events,
      // so this is a workaround done to compare the "reference" values
      // of the array to determine whether or not it was changed
      const propertyStateChanged = (state.selectedElements !== previousState.selectedElements)
      if (!propertyStateChanged) {
        return
      }
      const currSelectedItemsGlobalIds = this.utils.getSelectedElementIds(state)
      const noChanges = unsortedArraysAreEqual(currSelectedItemsGlobalIds, lastSelectedElementGlobalIds)
      if (noChanges) {
        return
      }
      const eventData = {previous: lastSelectedElementGlobalIds, current: currSelectedItemsGlobalIds}
      this.apiConnection.send(this.name, eventData)
      lastSelectedElementGlobalIds = currSelectedItemsGlobalIds
    })
  }
}

export default ElementSelectionChangedEventDispatcher
