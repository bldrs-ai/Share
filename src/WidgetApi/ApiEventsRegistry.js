import useStore from '../store/useStore'


const EVENT_LOAD_MODEL = 'ai.bldrs-share.loadModel'
const EVENT_HIGHLIGHT_ELEMENTS = 'ai.bldrs-share.highlightElements'
const EVENT_CLIENT_HIGHLIGHT_ELEMENTS = 'ai.bldrs-share.client.setHighlightedElements'

/**
 * Api Events are defined here
 */
class ApiEventsRegistry {
  apiConnection = null
  navigation = null

  /**
   * constructor
   */
  constructor(apiConnection, navigation) {
    this.apiConnection = apiConnection
    this.navigation = navigation
    this.registerEventHandlers()
    this.registerEventDispatchers()
    apiConnection.start()
  }

  EVENT_HANDLER_LOAD_MODEL = (data) => {
    if (!('githubIfcPath' in data)) {
      return this.apiConnection.missingArgumentResponse('githubIfcPath')
    }
    this.navigation(`/share/v/gh/${ data.githubIfcPath}`)
    return this.apiConnection.successfulResponse({})
  }

  EVENT_HANDLER_HIGHLIGHT_ELEMENTS = (data) => {
    if (!('githubIfcPath' in data)) {
      return this.apiConnection.missingArgumentResponse('githubIfcPath')
    }
    if (!('globalIds' in data)) {
      return this.apiConnection.missingArgumentResponse('globalIds')
    }
    if (data.globalIds.length) {
      this.navigation(`/share/v/gh/${ data.githubIfcPath }?q=${ data.globalIds[0]}`)
    } else {
      this.navigation( `/share/v/gh/${ data.githubIfcPath}`)
    }

    return this.apiConnection.successfulResponse({})
  }

  EVENT_HANDLER_MAP = {
    [EVENT_LOAD_MODEL]: this.EVENT_HANDLER_LOAD_MODEL,
    [EVENT_HIGHLIGHT_ELEMENTS]: this.EVENT_HANDLER_HIGHLIGHT_ELEMENTS,
  }

  EVENT_DISPATCHER_HIGHLIGHT_ELEMENTS = () => {
    let lastSelectedElements = []
    useStore.subscribe((state) => {
      if (state.selectedElement && Object.prototype.hasOwnProperty.call(state.selectedElement, 'GlobalId')) {
        const newSelectedElements = [state.selectedElement.GlobalId.value]
        if (JSON.stringify(lastSelectedElements) !== JSON.stringify(newSelectedElements)) {
          lastSelectedElements = newSelectedElements
          this.apiConnection.send(EVENT_CLIENT_HIGHLIGHT_ELEMENTS, lastSelectedElements)
        }
      }
    })
  }

  EVENT_DISPATCHER_MAP = {
    [EVENT_CLIENT_HIGHLIGHT_ELEMENTS]: this.EVENT_DISPATCHER_HIGHLIGHT_ELEMENTS,
  }

  registerEventHandlers = () => {
    for (const [eventName, eventHandler] of Object.entries(this.EVENT_HANDLER_MAP)) {
      this.apiConnection.on(`action:${ eventName}`, eventHandler)
    }
  }

  registerEventDispatchers = () => {
    this.apiConnection.requestCapabilities(Object.keys(this.EVENT_DISPATCHER_MAP))
    for (const eventDispatcher of Object.values(this.EVENT_DISPATCHER_MAP)) {
      eventDispatcher()
    }
  }
}

export default ApiEventsRegistry
