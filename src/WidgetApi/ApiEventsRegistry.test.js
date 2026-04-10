import ApiEventsRegistry from './ApiEventsRegistry'


// The real dispatchers subscribe to useStore in initDispatch(); mock it to
// a no-op so tests don't leak global subscriptions between runs. The real
// handler classes are otherwise exercised, which lets us validate that the
// registry imports them and wires their names into apiConnection.on().
jest.mock('../store/useStore', () => ({
  __esModule: true,
  default: {
    subscribe: jest.fn(),
    getState: jest.fn(() => ({})),
    setState: jest.fn(),
  },
}))


describe('WidgetApi/ApiEventsRegistry', () => {
  const HANDLER_NAMES = [
    'ai.bldrs-share.LoadModel',
    'ai.bldrs-share.SelectElements',
    'ai.bldrs-share.HighlightElements',
    'ai.bldrs-share.UIComponentsVisibility',
    'ai.bldrs-share.SuppressAboutDialog',
    'ai.bldrs-share.HideElements',
    'ai.bldrs-share.UnhideElements',
    'ai.bldrs-share.ChangeViewSettings',
  ]

  const DISPATCHER_NAMES = [
    'ai.bldrs-share.SelectionChanged',
    'ai.bldrs-share.ModelLoaded',
    'ai.bldrs-share.HiddenElements',
  ]

  let apiConnection
  let navigation
  let searchIndex

  beforeEach(() => {
    apiConnection = {
      on: jest.fn(),
      start: jest.fn(),
      send: jest.fn(),
      requestCapabilities: jest.fn(),
    }
    navigation = jest.fn()
    searchIndex = {
      getGlobalIdByExpressId: jest.fn(),
      getExpressIdByGlobalId: jest.fn(),
    }
  })


  it('calls apiConnection.start() exactly once on construction', () => {
    new ApiEventsRegistry(apiConnection, navigation, searchIndex)
    expect(apiConnection.start).toHaveBeenCalledTimes(1)
  })


  it('registers an action:<name> handler for every event handler', () => {
    new ApiEventsRegistry(apiConnection, navigation, searchIndex)

    const registered = apiConnection.on.mock.calls.map(([eventName]) => eventName)
    for (const name of HANDLER_NAMES) {
      expect(registered).toContain(`action:${name}`)
    }
    expect(apiConnection.on).toHaveBeenCalledTimes(HANDLER_NAMES.length)
  })


  it('registers each handler with a callable', () => {
    new ApiEventsRegistry(apiConnection, navigation, searchIndex)

    for (const [, callback] of apiConnection.on.mock.calls) {
      expect(typeof callback).toBe('function')
    }
  })


  it('requests capabilities for every dispatcher by name', () => {
    new ApiEventsRegistry(apiConnection, navigation, searchIndex)

    expect(apiConnection.requestCapabilities).toHaveBeenCalledTimes(1)
    const capabilityNames = apiConnection.requestCapabilities.mock.calls[0][0]
    for (const name of DISPATCHER_NAMES) {
      expect(capabilityNames).toContain(name)
    }
    expect(capabilityNames.length).toBe(DISPATCHER_NAMES.length)
  })


  it('stores the navigation and searchIndex references on the registry', () => {
    const registry = new ApiEventsRegistry(apiConnection, navigation, searchIndex)
    expect(registry.apiConnection).toBe(apiConnection)
    expect(registry.navigation).toBe(navigation)
    expect(registry.searchIndex).toBe(searchIndex)
  })
})
