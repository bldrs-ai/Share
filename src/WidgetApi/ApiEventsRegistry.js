import useStore from '../store/useStore'


const EVENT_VIEWER_LOAD_MODEL = 'ai.bldrs-share.LoadModel'
const EVENT_VIEWER_SELECT_ELEMENTS = 'ai.bldrs-share.SelectElements'
const EVENT_CLIENT_SELECT_ELEMENTS = 'ai.bldrs-share.ElementsSelected'
const EVENT_CLIENT_DESELECT_ELEMENTS = 'ai.bldrs-share.ElementsDeSelected'

/**
 * Api Events are defined here
 */
class ApiEventsRegistry {
  apiConnection = null
  navigation = null
  searchIndex = null
  selectElementsDebounce = false
  deselectElementsDebounce = false

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

  EVENT_HANDLER_LOAD_MODEL = (data) => {
    if (!('githubIfcPath' in data)) {
      return this.apiConnection.missingArgumentResponse('githubIfcPath')
    }
    this.navigation(`/share/v/gh/${ data.githubIfcPath}`)
    return this.apiConnection.successfulResponse({})
  }

  EVENT_HANDLER_SELECT_ELEMENTS = (data) => {
    const expressIds = []

    if (!('globalIds' in data)) {
      return this.apiConnection.missingArgumentResponse('globalIds')
    }

    if (data.globalIds.length) {
      for (const globalId of data.globalIds) {
        const expressId = this.searchIndex.getExpressIdByGlobalId(globalId)
        if (expressId) {
          expressIds.push(expressId)
        }
      }
    }
    this.selectElementsDebounce = true
    this.deselectElementsDebounce = true
    useStore.setState({ selectedElements: expressIds}) 
    useStore.setState({ selectedElement: expressIds.length == 1 ? expressIds[0] : null }) 
    
    return this.apiConnection.successfulResponse({})
  }

  EVENT_HANDLER_MAP = {
    [EVENT_VIEWER_LOAD_MODEL]: this.EVENT_HANDLER_LOAD_MODEL,
    [EVENT_VIEWER_SELECT_ELEMENTS]: this.EVENT_HANDLER_SELECT_ELEMENTS,
  }

  /**
   * get ids of selected elements.
   *
   * @param {object} state
   * @return {string[]} array of GlobalIds.
   */
  getSelectedElementIds(state) {
    if(state.selectedElements == null) return [];
    const elementIds = []
    for (const expressId of state.selectedElements) {
      const globalId = this.searchIndex.getGlobalIdByExpressId(expressId)
      if (globalId) {
        elementIds.push(globalId)
      }
    }
    return elementIds
  }

  /**
   * check if state has changed.
   *
   * @param {object} state
   * @param {string[]} lastSelectedElementIds
   * @return {boolean}
   */
  selectedElementIdsHasChanged(state, lastSelectedElementIds) {
    if((state.selectedElements == null) != (lastSelectedElementIds == null)) {
      return true;
    }

    // @source https://github.com/30-seconds/30-seconds-blog/blob/master/blog_posts/javascript-array-comparison.md
    const equals = (a, b) => {
      if (a.length !== b.length) {
        return false
      }
      const uniqueValues = new Set([...a, ...b])
      for (const v of uniqueValues) {
        const aCount = a.filter((e) => e === v).length
        const bCount = b.filter((e) => e === v).length
        if (aCount !== bCount) {
          return false
        }
      }
      return true
    }

    if (Array.isArray(state.selectedElements)) {
      return !equals(lastSelectedElementIds, this.getSelectedElementIds(state))
    }
  }

  EVENT_DISPATCHER_ELEMENT_SELECTION = () => {
    let lastSelectedElementIds = []
    useStore.subscribe((state) => {
      if (this.selectedElementIdsHasChanged(state, lastSelectedElementIds)) {
        const newSelectedElementIds = this.getSelectedElementIds(state)
        if (!this.selectElementsDebounce) {
          if (newSelectedElementIds.length > 0) {
            this.apiConnection.send(EVENT_CLIENT_SELECT_ELEMENTS, newSelectedElementIds)
          }
        }
        lastSelectedElementIds = newSelectedElementIds
        this.selectElementsDebounce = false
      }
    })
  }

  EVENT_DISPATCHER_ELEMENT_DESELECTION = () => {
    let lastSelectedElementIds = []
    useStore.subscribe((state) => {
      if (this.selectedElementIdsHasChanged(state, lastSelectedElementIds)) {
        const newSelectedElementIds = this.getSelectedElementIds(state)
        if (!this.deselectElementsDebounce) {
          const deSelectedElementIds = lastSelectedElementIds.filter((x) => !newSelectedElementIds.includes(x))
          if (deSelectedElementIds && deSelectedElementIds.length > 0) {
            this.apiConnection.send(EVENT_CLIENT_DESELECT_ELEMENTS, deSelectedElementIds)
          }
        }
        lastSelectedElementIds = newSelectedElementIds
        this.deselectElementsDebounce = false
      }
    })
  }

  EVENT_DISPATCHER_MAP = {
    [EVENT_CLIENT_SELECT_ELEMENTS]: this.EVENT_DISPATCHER_ELEMENT_SELECTION,
    [EVENT_CLIENT_DESELECT_ELEMENTS]: this.EVENT_DISPATCHER_ELEMENT_DESELECTION,
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
