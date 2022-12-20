import ApiEventDispatcher from './ApiEventDispatcher'
import Utils from '../Utils'
import useStore from '../../store/useStore'

/**
 * class ElementSelectionEventDispatcher
 */
class ElementSelectionEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.ElementsSelected'
  canDispatch = true

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
    if (this.canDispatch) {
      let lastSelectedElementIds = []
      useStore.subscribe((state) => {
        if (this.utils.selectedElementIdsHasChanged(state, lastSelectedElementIds)) {
          const newSelectedElementIds = this.utils.getSelectedElementIds(state)
          if (!state.selectElementsDebounce) {
            if (newSelectedElementIds.length > 0) {
              this.apiConnection.send(this.name, newSelectedElementIds)
            }
          }
          lastSelectedElementIds = newSelectedElementIds
          state.setSelectElementsDebounce(false)
        }
      })
    }
  }
}

export default ElementSelectionEventDispatcher
