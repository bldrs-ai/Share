import useStore from '../store/useStore'
import {LoadAbortedError} from '../utils/loadAbort'
import {HANG_TIMEOUT_MS, LoadReporter, loadFailureInfoOf} from '../loader/loadProgress'
import {consoleTeeHolder} from '../loader/consoleTee'
import {LoadState, ModelSessionHost} from './modelSession'


// open-205 #2019 (Phase 1b step 1): a model session owns its load job, and
// only the active session's current job writes the model's state. These pin
// the structural half: a write from a session the view is no longer bound to
// never reaches the store, whatever the load does (CadView.test.jsx drives
// the same through a real load).
describe('session/modelSession', () => {
  let forget
  let host

  beforeEach(() => {
    forget = jest.fn()
    host = new ModelSessionHost({onForget: forget, makeReport: (options) => new LoadReporter(options)})
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
    first.markReady()
    expect(session.loadState).toBe(LoadState.READY)
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
    expect(sessionA.loadState).toBe(LoadState.CLOSED)
  })

  it('tells sessions apart by id, and tracks a run\'s state (engine-worker.md §5.2)', () => {
    const sessionA = host.open('A')
    const job = sessionA.beginLoad({isAbortable: true})
    expect(sessionA.loadState).toBe(LoadState.LOADING)
    job.markFailed()
    expect(sessionA.loadState).toBe(LoadState.FAILED)
    const sessionB = host.open('B')
    expect(sessionB.id).not.toBe(sessionA.id)
    // A left run's verdict is not the session's any more.
    job.markReady()
    expect(sessionA.loadState).toBe(LoadState.CLOSED)
  })

  it('runs what was bound to close with the session, once', () => {
    const sessionA = host.open('A')
    const closer = jest.fn()
    sessionA.bindCloser(closer)
    host.open('B')
    sessionA.close()
    expect(closer).toHaveBeenCalledTimes(1)
  })

  it('leaves a handler alone once the next session has bound its own', () => {
    const sessionA = host.open('A')
    sessionA.bindWindowHandler('onkeydown', () => 'A')
    const ofB = () => 'B'
    window.onkeydown = ofB
    sessionA.close()
    expect(window.onkeydown).toBe(ofB)
  })

  describe('the loading UI belongs to the run that put it up (codex on #2247)', () => {
    beforeEach(() => {
      useStore.setState({isModelLoading: false, snackMessage: null})
    })

    it('a left run unwinding after the next view\'s run began leaves that run\'s overlay and snackbar', () => {
      // Two views, as after a remount across route families: each its own host.
      const jobOfA = host.open('A').beginLoad({isAbortable: true})
      jobOfA.showLoading('Loading A')
      host.closeActive()
      const nextView = new ModelSessionHost({onForget: () => null})
      const jobOfB = nextView.open('B').beginLoad({isAbortable: true})
      jobOfB.showLoading('Loading B')

      jobOfA.hideLoading()
      jobOfA.updateLoadingMessage('Loading A: still working')
      jobOfA.endLoading()

      expect(useStore.getState().isModelLoading).toBe(true)
      expect(useStore.getState().snackMessage).toBe('Loading B')
      jobOfB.endLoading()
      expect(useStore.getState().isModelLoading).toBe(false)
      expect(useStore.getState().snackMessage).toBeNull()
    })

    it('the left view\'s run stops being current as soon as the next view opens its session', () => {
      const jobOfA = host.open('A').beginLoad({isAbortable: true})
      // The next view mounts and opens B before the left view's unmount close
      // (a microtask later) has run.
      const nextView = new ModelSessionHost({onForget: () => null})
      nextView.open('B').beginLoad({isAbortable: true})

      expect(jobOfA.isCurrent()).toBe(false)
      expect(jobOfA.set({model: {name: 'A'}})).toBe(false)
      expect(useStore.getState().model).toBeNull()
    })

    it('a run given up with no run after it still takes its own down', () => {
      const jobOfA = host.open('A').beginLoad({isAbortable: true})
      jobOfA.showLoading('Loading A')
      host.closeActive()
      expect(jobOfA.isCurrent()).toBe(false)

      jobOfA.endLoading()

      expect(useStore.getState().isModelLoading).toBe(false)
      expect(useStore.getState().snackMessage).toBeNull()
    })

    it('a run the user has already left never puts it up', () => {
      const jobOfA = host.open('A').beginLoad({isAbortable: true})
      host.open('B')
      jobOfA.showLoading('Loading A')
      expect(useStore.getState().isModelLoading).toBe(false)
      expect(useStore.getState().snackMessage).toBeNull()
    })
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

  // open-t200 slice R (design/tracks/open-t200/layering.md §4.4): each run
  // makes its own reporter, whose sink is the run, so a run the user has
  // left reports into nothing however late it reports.
  describe('a reporter per run', () => {
    let infoSpy

    beforeEach(() => {
      jest.useFakeTimers()
      infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
      useStore.setState({loadReportLines: [], currentLoadLine: null, loadResult: null})
    })

    afterEach(() => {
      infoSpy.mockRestore()
      jest.useRealTimers()
    })

    // The remount of #2247: the left view's run unwinds after the next
    // view's has begun. Red with one reporter shared by the page, as
    // `activeReporter` was: A's late line lands in B's report and A's end
    // ends it.
    it('two runs at once keep their lines apart, and each ends only itself', () => {
      const jobOfA = host.open('A').beginLoad({isAbortable: true})
      const reportOfA = jobOfA.beginReport({fileInfo: 'a.ifc'})
      const nextView = new ModelSessionHost({onForget: () => null, makeReport: host.makeReport})
      const jobOfB = nextView.open('B').beginLoad({isAbortable: true})
      const reportOfB = jobOfB.beginReport({fileInfo: 'b.ifc'})
      reportOfB.line('Source: B')
      reportOfB.progress({phase: 'geometry', completed: 1, total: 4, elapsedMs: 10})

      reportOfA.line('Source: A, late')
      reportOfA.end(new Error('A failed after the user left'))

      expect(reportOfA).not.toBe(reportOfB)
      expect(reportOfA.lines).toContain('Source: A, late')
      expect(reportOfB.lines).not.toContain('Source: A, late')
      expect(reportOfB.ended).toBe(false)
      // What the user sees is B's report alone: A's writes went nowhere.
      expect(useStore.getState().loadReportLines).toEqual(reportOfB.lines)
      expect(useStore.getState().loadResult).toBeNull()
      expect(useStore.getState().currentLoadLine).not.toBeNull()
      reportOfB.end()
      expect(useStore.getState().loadResult).toEqual({status: 'success', summaryLine: 'Loaded b.ifc'})
    })

    // What the next load's begin did to the previous reporter before slice
    // R, now done by the run being given up.
    it('leaving a run quiets its reporter: no stall clock, and the console tee given up', () => {
      const jobOfA = host.open('A').beginLoad({isAbortable: false})
      const reportOfA = jobOfA.beginReport({fileInfo: 'a.ifc', onStall: jest.fn()})
      reportOfA.progress({phase: 'geometry', completed: 1, total: 4, elapsedMs: 10})
      expect(consoleTeeHolder()).toBe(reportOfA)

      host.open('B')

      expect(reportOfA.ended).toBe(true)
      expect(consoleTeeHolder()).toBeNull()
      jest.advanceTimersByTime(HANG_TIMEOUT_MS)
      expect(reportOfA.onStall).not.toHaveBeenCalled()
      // Still readable, for the abort's GA event.
      expect(loadFailureInfoOf(jobOfA.report).phase).toBe('geometry')
    })

    // Before slice R a serial told "a reporter began for this attempt" apart
    // from "an earlier load's is still lingering". Red if a run read the
    // last reporter of the page: the new run would report A's phase.
    it('a run that failed before its reporter began reads no earlier run\'s phase', () => {
      const session = host.open('A')
      const first = session.beginLoad({isAbortable: true})
      first.beginReport({fileInfo: 'a.ifc'}).progress({phase: 'geometry', completed: 1, total: 4})
      const second = session.beginLoad({isAbortable: true})

      expect(second.report).toBeNull()
      expect(loadFailureInfoOf(second.report)).toEqual({phase: undefined, fileSize: undefined, format: undefined})
      expect(loadFailureInfoOf(first.report).phase).toBe('geometry')
    })
  })
})
