import ApiEventDispatcher from './ApiEventDispatcher'
import Utils from '../Utils'
import useStore from '../../store/useStore'
import {unsortedArraysAreEqual} from '../../utils/arrays'

/**
 * class HiddenElementsEventDispatcher
 */
class HiddenElementsEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.HiddenElements'
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
    let lastHiddenElementsGlobalIds = []
    useStore.subscribe((state, previousState) => {
      const propertyStateChanged = (state.hiddenElements !== previousState.hiddenElements)
      if (!propertyStateChanged) {
        return
      }
      const hiddenElmentsExpressIds = []
      Object.entries(state.hiddenElements).forEach((entry) => {
        const [key, value] = entry
        if (value === true) {
          hiddenElmentsExpressIds.push(key)
        }
      })
      const currHiddenElementsGlobalIds = this.utils.getElementsGlobalIds(hiddenElmentsExpressIds)
      const noChanges = unsortedArraysAreEqual(currHiddenElementsGlobalIds, lastHiddenElementsGlobalIds)
      if (noChanges) {
        return
      }
      const eventData = {previous: lastHiddenElementsGlobalIds, current: currHiddenElementsGlobalIds}
      this.apiConnection.send(this.name, eventData)
      lastHiddenElementsGlobalIds = currHiddenElementsGlobalIds
    })
  }
}

export default HiddenElementsEventDispatcher
