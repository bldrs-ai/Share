/* eslint-disable no-magic-numbers */
// Characterization tests for ElementSelectionChangedEventDispatcher. See
// HideElementsEventHandler.test.js for scope.

import ElementSelectionChangedEventDispatcher from './ElementSelectionChangedEventDispatcher'


let mockCapturedListener = null

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    subscribe: jest.fn((listener) => {
      mockCapturedListener = listener
      return () => {
        mockCapturedListener = null
      }
    }),
  },
}))


/**
 * @param {object} table expressId -> globalId
 * @return {object} stub searchIndex
 */
function stubSearchIndex(table) {
  return {
    getGlobalIdByExpressId: (id) => table[id],
    getExpressIdByGlobalId: jest.fn(),
  }
}


describe('WidgetApi/event-dispatchers/ElementSelectionChangedEventDispatcher', () => {
  let apiConnection

  beforeEach(() => {
    mockCapturedListener = null
    apiConnection = {send: jest.fn()}
  })


  it('exposes the canonical event name', () => {
    const d = new ElementSelectionChangedEventDispatcher(apiConnection, stubSearchIndex({}))
    expect(d.name).toBe('ai.bldrs-share.SelectionChanged')
  })


  it('subscribes to the store on initDispatch', () => {
    const d = new ElementSelectionChangedEventDispatcher(apiConnection, stubSearchIndex({}))
    d.initDispatch()
    expect(mockCapturedListener).toBeInstanceOf(Function)
  })


  it('does not dispatch when selectedElements reference is unchanged', () => {
    const d = new ElementSelectionChangedEventDispatcher(apiConnection, stubSearchIndex({}))
    d.initDispatch()

    const same = [10]
    mockCapturedListener({selectedElements: same}, {selectedElements: same})

    expect(apiConnection.send).not.toHaveBeenCalled()
  })


  it('dispatches previous/current globalIds on first non-empty selection', () => {
    const d = new ElementSelectionChangedEventDispatcher(
      apiConnection,
      stubSearchIndex({10: 'gid-a', 20: 'gid-b'}),
    )
    d.initDispatch()

    mockCapturedListener(
      {selectedElements: [10, 20]},
      {selectedElements: []},
    )

    expect(apiConnection.send).toHaveBeenCalledTimes(1)
    const [eventName, payload] = apiConnection.send.mock.calls[0]
    expect(eventName).toBe('ai.bldrs-share.SelectionChanged')
    expect(payload.previous).toEqual([])
    expect(payload.current.sort()).toEqual(['gid-a', 'gid-b'])
  })


  // Mirror of the equivalent TODO in HiddenElementsEventDispatcher.test.js.
  // Refactor target: derive the previous set from previousState, not from
  // a closure-captured "last" value.
  it('suppresses dispatch when the content is unchanged across distinct references', () => {
    const d = new ElementSelectionChangedEventDispatcher(
      apiConnection,
      stubSearchIndex({10: 'gid-a'}),
    )
    d.initDispatch()

    mockCapturedListener({selectedElements: [10]}, {selectedElements: []})
    apiConnection.send.mockClear()

    mockCapturedListener({selectedElements: [10]}, {selectedElements: [10]})
    expect(apiConnection.send).not.toHaveBeenCalled()
  })
})
