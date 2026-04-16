// Characterization tests for HiddenElementsEventDispatcher. See
// HideElementsEventHandler.test.js for scope.

import HiddenElementsEventDispatcher from './HiddenElementsEventDispatcher'


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
 * Build a searchIndex stub whose globalId-by-expressId lookup uses the
 * supplied table.
 *
 * @param {object} table map of expressId -> globalId
 * @return {object} stub searchIndex
 */
function stubSearchIndex(table) {
  return {
    getGlobalIdByExpressId: (id) => table[id],
    getExpressIdByGlobalId: jest.fn(),
  }
}


describe('WidgetApi/event-dispatchers/HiddenElementsEventDispatcher', () => {
  let apiConnection

  beforeEach(() => {
    mockCapturedListener = null
    apiConnection = {send: jest.fn()}
  })


  it('exposes the canonical event name', () => {
    const d = new HiddenElementsEventDispatcher(apiConnection, stubSearchIndex({}))
    expect(d.name).toBe('ai.bldrs-share.HiddenElements')
  })


  it('subscribes to the store on initDispatch', () => {
    const d = new HiddenElementsEventDispatcher(apiConnection, stubSearchIndex({}))
    d.initDispatch()
    expect(mockCapturedListener).toBeInstanceOf(Function)
  })


  it('does not dispatch when hiddenElements reference is unchanged', () => {
    const d = new HiddenElementsEventDispatcher(apiConnection, stubSearchIndex({}))
    d.initDispatch()

    const same = {}
    mockCapturedListener({hiddenElements: same}, {hiddenElements: same})

    expect(apiConnection.send).not.toHaveBeenCalled()
  })


  it('dispatches the previous/current globalId sets on first hidden element', () => {
    const searchIndex = stubSearchIndex({10: 'gid-a', 20: 'gid-b'})
    const d = new HiddenElementsEventDispatcher(apiConnection, searchIndex)
    d.initDispatch()

    mockCapturedListener(
      {hiddenElements: {10: true, 20: true}},
      {hiddenElements: {}},
    )

    expect(apiConnection.send).toHaveBeenCalledTimes(1)
    const [eventName, payload] = apiConnection.send.mock.calls[0]
    expect(eventName).toBe('ai.bldrs-share.HiddenElements')
    expect(payload.previous).toEqual([])
    expect(payload.current.sort()).toEqual(['gid-a', 'gid-b'])
  })


  // TODO: HiddenElementsEventDispatcher compares the current hidden set to
  // its own internal `lastHiddenElementsGlobalIds` closure, NOT to
  // `previousState.hiddenElements`. That means if two subscribers get out
  // of sync or initDispatch is re-run, the "previous" field can lag
  // reality. Refactor target: derive previous from previousState directly.
  it('suppresses the dispatch when the set of hidden globalIds is unchanged (different reference, same content)', () => {
    const searchIndex = stubSearchIndex({10: 'gid-a'})
    const d = new HiddenElementsEventDispatcher(apiConnection, searchIndex)
    d.initDispatch()

    mockCapturedListener({hiddenElements: {10: true}}, {hiddenElements: {}})
    apiConnection.send.mockClear()

    // Fresh hiddenElements object with the same set → no new dispatch.
    mockCapturedListener({hiddenElements: {10: true}}, {hiddenElements: {10: true}})
    expect(apiConnection.send).not.toHaveBeenCalled()
  })


  it('entries with value !== true are excluded from the hidden set', () => {
    const searchIndex = stubSearchIndex({10: 'gid-a', 20: 'gid-b'})
    const d = new HiddenElementsEventDispatcher(apiConnection, searchIndex)
    d.initDispatch()

    mockCapturedListener(
      {hiddenElements: {10: true, 20: false}},
      {hiddenElements: {}},
    )

    const payload = apiConnection.send.mock.calls[0][1]
    expect(payload.current).toEqual(['gid-a'])
  })
})
