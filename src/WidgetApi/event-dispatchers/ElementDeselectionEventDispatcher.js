import ApiEventDispatcher from './ApiEventDispatcher'
import Utils from '../Utils'
import useStore from '../../store/useStore'

/**
 * class ElementDeselectionEventDispatcher
 */
class ElementDeselectionEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.ElementsDeSelected'
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
    let lastSelectedElementIds = []
    useStore.subscribe((state) => {
      if (this.utils.selectedElementIdsHasChanged(state, lastSelectedElementIds)) {
        const newSelectedElementIds = this.utils.getSelectedElementIds(state)
        const deSelectedElementIds = lastSelectedElementIds.filter((x) => !newSelectedElementIds.includes(x))
        if (deSelectedElementIds && deSelectedElementIds.length > 0) {
          this.apiConnection.send(this.name, deSelectedElementIds)
        }
        lastSelectedElementIds = newSelectedElementIds
      }
    })
  }
}

export default ElementDeselectionEventDispatcher
