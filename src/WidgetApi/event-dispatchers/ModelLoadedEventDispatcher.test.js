import ModelLoadedEventDispatcher from './ModelLoadedEventDispatcher'


// Stub useStore.subscribe to capture the listener the dispatcher registers,
// so the test can simulate store state changes without touching the real
// zustand store.
let capturedListener = null

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    subscribe: jest.fn((listener) => {
      capturedListener = listener
      return () => {
        capturedListener = null
      }
    }),
  },
}))


describe('WidgetApi/event-dispatchers/ModelLoadedEventDispatcher', () => {
  let apiConnection

  beforeEach(() => {
    capturedListener = null
    apiConnection = {
      send: jest.fn(),
    }
  })


  it('exposes the canonical event name', () => {
    const dispatcher = new ModelLoadedEventDispatcher(apiConnection)
    expect(dispatcher.name).toBe('ai.bldrs-share.ModelLoaded')
  })


  it('subscribes to the store on initDispatch', () => {
    const dispatcher = new ModelLoadedEventDispatcher(apiConnection)
    dispatcher.initDispatch()
    expect(capturedListener).toBeInstanceOf(Function)
  })


  it('dispatches ModelLoaded when state.model changes reference', () => {
    const dispatcher = new ModelLoadedEventDispatcher(apiConnection)
    dispatcher.initDispatch()

    const prev = {model: null}
    const next = {model: {id: 'abc'}}
    capturedListener(next, prev)

    expect(apiConnection.send).toHaveBeenCalledTimes(1)
    expect(apiConnection.send).toHaveBeenCalledWith('ai.bldrs-share.ModelLoaded', {})
  })


  it('does not dispatch when state.model reference is unchanged', () => {
    const dispatcher = new ModelLoadedEventDispatcher(apiConnection)
    dispatcher.initDispatch()

    const sameModel = {id: 'abc'}
    capturedListener({model: sameModel}, {model: sameModel})

    expect(apiConnection.send).not.toHaveBeenCalled()
  })


  it('dispatches again on subsequent model changes', () => {
    const dispatcher = new ModelLoadedEventDispatcher(apiConnection)
    dispatcher.initDispatch()

    capturedListener({model: {id: 'a'}}, {model: null})
    capturedListener({model: {id: 'b'}}, {model: {id: 'a'}})

    expect(apiConnection.send).toHaveBeenCalledTimes(2)
  })
})
