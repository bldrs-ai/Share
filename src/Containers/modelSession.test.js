import useStore from '../store/useStore'
import {LoadAbortedError} from '../utils/loadAbort'
import {ModelSessionHost} from './modelSession'


// open-205 #2019 (Phase 1b step 1): a model session owns its load job, and
// only the active session's current job writes the model's state. These pin
// the structural half: a write from a session the view is no longer bound to
// never reaches the store, whatever the load does (CadView.test.jsx drives
// the same through a real load).
describe('Containers/modelSession', () => {
  let forget
  let host

  beforeEach(() => {
    forget = jest.fn()
    host = new ModelSessionHost({onForget: forget})
    useStore.setState({model: null, rootElement: null, isModelReady: false})
  })

  afterEach(() => {
    window.ondblclick = null
    window.onkeydown = null
  })

  it('writes the active session\'s current job into the store', () => {
    const job = host.open('A').beginLoad({isAbortable: true})
    const modelOfA = {name: 'A'}

    expect(job.isCurrent()).toBe(true)
    expect(job.set({model: modelOfA, isModelReady: true})).toBe(true)
    expect(useStore.getState().model).toBe(modelOfA)
    expect(useStore.getState().isModelReady).toBe(true)
  })

  it('drops every write of a session the user has left, and aborts its load', () => {
    const sessionA = host.open('A')
    const jobOfA = sessionA.beginLoad({isAbortable: true})
    host.open('B').beginLoad({isAbortable: true})

    expect(sessionA.isClosed).toBe(true)
    expect(jobOfA.signal.aborted, 'leaving A aborts its load').toBe(true)
    expect(jobOfA.isCurrent()).toBe(false)
    // A's load finishing anyway (a mesh parse cannot be stopped) writes
    // nothing over B.
    expect(jobOfA.set({model: {name: 'A'}, isModelReady: true})).toBe(false)
    expect(useStore.getState().model).toBeNull()
    expect(useStore.getState().isModelReady).toBe(false)
    const sideEffect = jest.fn()
    expect(jobOfA.ifCurrent(sideEffect)).toBe(false)
    expect(sideEffect).not.toHaveBeenCalled()
    expect(() => jobOfA.throwIfLeft()).toThrow(LoadAbortedError)
  })

  it('drops the writes of a left session that has no abort signal (the kill switch)', () => {
    const jobOfA = host.open('A').beginLoad({isAbortable: false})
    expect(jobOfA.signal).toBeUndefined()
    host.open('B')

    expect(jobOfA.set({model: {name: 'A'}})).toBe(false)
    expect(useStore.getState().model).toBeNull()
  })

  it('a return to A is a new session: the first A\'s load stays left', () => {
    const jobOfFirstA = host.open('A').beginLoad({isAbortable: false})
    host.open('B')
    const secondA = host.open('A')

    expect(secondA.isActive()).toBe(true)
    expect(jobOfFirstA.isCurrent()).toBe(false)
    expect(jobOfFirstA.set({model: {name: 'first A'}})).toBe(false)
    expect(useStore.getState().model).toBeNull()
  })

  it('forgets the model\'s state on every switch, the first open included', () => {
    host.open('A')
    expect(forget).toHaveBeenLastCalledWith({isSwitch: true})
    host.open('B')
    expect(forget).toHaveBeenCalledTimes(2)
  })

  it('keeps the session for the same model (a theme or view-settings rebuild)', () => {
    const session = host.open('A')
    expect(host.open('A')).toBe(session)
    expect(forget).toHaveBeenCalledTimes(1)
  })

  it('a new run supersedes the previous one of the same session', () => {
    const session = host.open('A')
    const first = session.beginLoad({isAbortable: true})
    const second = session.beginLoad({isAbortable: true})

    expect(first.signal.aborted).toBe(true)
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
    expect(first.set({model: {name: 'first run'}})).toBe(false)
    expect(useStore.getState().model).toBeNull()
  })

  it('forgets what a run given up mid-load brought up before the next run starts', () => {
    const session = host.open('A')
    session.beginLoad({isAbortable: true})
    forget.mockClear()
    // The viewer is re-created mid-load (a theme change): the run is given
    // up, and the replay starts from scratch.
    session.abortLoad()
    session.beginLoad({isAbortable: true})
    expect(forget).toHaveBeenCalledWith({isSwitch: false})
  })

  it('keeps a finished run\'s state when the next run of the session starts', () => {
    const session = host.open('A')
    const first = session.beginLoad({isAbortable: true})
    first.isComplete = true
    forget.mockClear()
    session.abortLoad()
    session.beginLoad({isAbortable: true})
    expect(forget).not.toHaveBeenCalled()
  })

  it('closing a session unbinds its window handlers, closes its engine and drops it', () => {
    const sessionA = host.open('A')
    const close = jest.fn()
    sessionA.bindEngine({ifcManager: {ifcAPI: {engineSession: {close}}}})
    const ondblclick = () => null
    sessionA.bindWindowHandler('ondblclick', ondblclick)
    expect(window.ondblclick).toBe(ondblclick)

    host.open('B')

    expect(window.ondblclick).toBeNull()
    expect(close).toHaveBeenCalledTimes(1)
    expect(sessionA.engine).toBeNull()
  })

  it('leaves a handler alone once the next session has bound its own', () => {
    const sessionA = host.open('A')
    sessionA.bindWindowHandler('onkeydown', () => 'A')
    const ofB = () => 'B'
    window.onkeydown = ofB
    sessionA.close()
    expect(window.onkeydown).toBe(ofB)
  })

  it('closeActive (an unmount) closes the session without forgetting the store', () => {
    const job = host.open('A').beginLoad({isAbortable: true})
    forget.mockClear()
    host.closeActive()

    expect(host.active).toBeNull()
    expect(job.signal.aborted).toBe(true)
    expect(job.isCurrent()).toBe(false)
    expect(forget).not.toHaveBeenCalled()
  })
})
