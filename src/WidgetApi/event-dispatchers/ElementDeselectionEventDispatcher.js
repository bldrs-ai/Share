import ApiEventDispatcher from './ApiEventDispatcher'
import Utils from '../Utils'
import useStore from '../../store/useStore'

/**
 * class ElementDeselectionEventDispatcher
 */
class ElementDeselectionEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.ElementsDeSelected'
  canDispatch = true
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
    useStore.subscribe((state) => {
      this.canDispatch = !state.deselectElementsDebounce
    })
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
          if (!state.deselectElementsDebounce) {
            const deSelectedElementIds = lastSelectedElementIds.filter((x) => !newSelectedElementIds.includes(x))
            if (deSelectedElementIds && deSelectedElementIds.length > 0) {
              this.apiConnection.send(this.name, deSelectedElementIds)
            }
          }
          lastSelectedElementIds = newSelectedElementIds
          state.setDeselectElementsDebounce(false)
        }
      })
    }
  }
}

export default ElementDeselectionEventDispatcher
