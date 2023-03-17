import LoadModelEventHandler from './event-handlers/LoadModelEventHandler'
import SelectElementsEventHandler from './event-handlers/SelectElementsEventHandler'
import UIComponentsVisibilityEventHandler from './event-handlers/UIComponentsVisibilityEventHandler'
import SuppressAboutDialogHandler from './event-handlers/SuppressAboutDialogHandler'
import ElementSelectionChangedEventDispatcher from './event-dispatchers/ElementSelectionChangedEventDispatcher'
import ModelLoadedEventDispatcher from './event-dispatchers/ModelLoadedEventDispatcher'

/**
 * Api Events are defined here
 */
class ApiEventsRegistry {
  apiConnection = null
  navigation = null
  searchIndex = null

  /**
   * constructor
   *
   * @param {object} apiConnection AbstractApiConnection
   * @param {object} navigation NavigationFunction
   * @param {object} searchIndex SearchIndex
   */
  constructor(apiConnection, navigation, searchIndex) {
    this.searchIndex = searchIndex
    this.apiConnection = apiConnection
    this.navigation = navigation
    this.registerEventHandlers()
    this.registerEventDispatchers()
    apiConnection.start()
  }

  /**
   * Registers the event handler
   *
   */
  registerEventHandlers() {
    const events = [
      new LoadModelEventHandler(this.apiConnection, this.navigation),
      new SelectElementsEventHandler(this.apiConnection, this.searchIndex),
      new UIComponentsVisibilityEventHandler(this.apiConnection),
      new SuppressAboutDialogHandler(this.apiConnection),
    ]
    for (const event of events) {
      this.apiConnection.on(`action:${event.name}`, event.handler.bind(event))
    }
  }

  /**
   * Registers the event dispatchers
   *
   */
  registerEventDispatchers() {
    const events = [
      new ElementSelectionChangedEventDispatcher(this.apiConnection, this.searchIndex),
      new ModelLoadedEventDispatcher(this.apiConnection),
    ]
    this.apiConnection.requestCapabilities(events.map((e) => e.name))
    for (const eventDispatcher of events) {
      const initDispatch = eventDispatcher.initDispatch.bind(eventDispatcher)
      initDispatch()
    }
  }
}

export default ApiEventsRegistry
