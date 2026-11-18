/* eslint-disable require-await */
import {createEngineModelLoad} from './engineModelLoad'
import {Ev} from './protocol'
import {LoadAbortedError} from '../utils/loadAbort'


// open-205 #2011 step A: a worker load given up mid-parse terminates its
// engine and unwinds as aborted, wherever its parse is waiting. A stand-in
// session rather than the in-process transport: what is under test is the
// load's side of the abort (which awaits it races, what it closes), and the
// stand-in makes each await one the test controls.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


/**
 * The EngineSession surface `createEngineModelLoad#parse` uses. `open`
 * waits for `resolveOpen`; `close` rejects what is pending and ends the
 * stream with `failed {kind: 'closed'}`, as EngineSession#fail does.
 */
class StandInSession {
  /** */
  constructor() {
    this.kind = 'worker'
    this.info = {conwayVersion: 'Conway v-test'}
    this.closed = false
    this.closeCount = 0
    this.listeners = new Map()
    this.modelID = -1
    this.opening = null
  }

  /**
   * @param {string} ev
   * @param {Function} cb
   * @return {Function}
   */
  on(ev, cb) {
    if (!this.listeners.has(ev)) {
      this.listeners.set(ev, new Set())
    }
    this.listeners.get(ev).add(cb)
    return () => this.listeners.get(ev)?.delete(cb)
  }

  /** @return {Promise<object>} */
  open() {
    return new Promise((resolve, reject) => {
      this.opening = {resolve, reject}
    })
  }

  /** Answer the open, as the engine does at the model's index. */
  resolveOpen() {
    this.modelID = 0
    this.opening.resolve({modelID: 0})
  }

  /** @return {Promise<void>} */
  pump() {
    return this.closed ? Promise.reject(new Error('engine session closed')) : Promise.resolve()
  }

  /** @return {Promise<void>} */
  close() {
    this.closeCount++
    if (this.closed) {
      return Promise.resolve()
    }
    this.closed = true
    this.opening?.reject(new Error('engine session closed'))
    for (const cb of this.listeners.get(Ev.FAILED) ?? []) {
      cb({ev: Ev.FAILED, kind: 'closed', message: 'engine session closed'})
    }
    this.listeners.clear()
    return Promise.resolve()
  }
}


/** Let pending promise callbacks run. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}


describe('engine/engineModelLoad abort (open-205 #2011 step A)', () => {
  afterEach(() => {
    delete globalThis.__bldrsTestHoldGeometryPump
  })

  it('terminates the engine and rejects as aborted when given up mid-open', async () => {
    const session = new StandInSession()
    const load = createEngineModelLoad({format: 'ifc', spawn: async () => session})
    const parsing = load.parse(new Uint8Array(8))
    await settle()
    expect(session.opening).not.toBeNull()

    load.abort()

    await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
    expect(session.closed).toBe(true)
    expect(load.aborted).toBe(true)
  })

  it('rejects as aborted when given up while the geometry streams', async () => {
    const session = new StandInSession()
    const load = createEngineModelLoad({format: 'step', spawn: async () => session})
    const onIndexed = jest.fn()
    const parsing = load.parse(new Uint8Array(8), {onIndexed})
    await settle()
    session.resolveOpen()
    await settle()
    expect(onIndexed).toHaveBeenCalledWith(0)

    load.abort()

    await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
    expect(session.closed).toBe(true)
  })

  it('closes a session that comes up only after the abort, and never opens it', async () => {
    const session = new StandInSession()
    const openSpy = jest.spyOn(session, 'open')
    let resolveSpawn
    const load = createEngineModelLoad({
      format: 'ifc',
      spawn: () => new Promise((resolve) => {
        resolveSpawn = resolve
      }),
    })
    const parsing = load.parse(new Uint8Array(8))
    await settle()

    load.abort()
    await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
    expect(session.closed).toBe(false)

    resolveSpawn(session)
    await settle()
    expect(session.closed).toBe(true)
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('does not stay suspended on a test hold that never lets go', async () => {
    globalThis.__bldrsTestHoldGeometryPump = () => new Promise(() => {})
    const session = new StandInSession()
    const load = createEngineModelLoad({format: 'ifc', spawn: async () => session})
    const parsing = load.parse(new Uint8Array(8))
    await settle()
    session.resolveOpen()
    await settle()

    load.abort()

    await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
    expect(session.closed).toBe(true)
  })

  it('reports a session closed under it WITHOUT an abort as the failure it is', async () => {
    const session = new StandInSession()
    const load = createEngineModelLoad({format: 'ifc', spawn: async () => session})
    const parsing = load.parse(new Uint8Array(8))
    await settle()
    session.resolveOpen()
    await settle()

    session.close()

    const error = await parsing.catch((e) => e)
    expect(error).not.toBeInstanceOf(LoadAbortedError)
    expect(error.engineFailureKind).toBe('closed')
    expect(load.aborted).toBe(false)
  })

  it('is idempotent', async () => {
    const session = new StandInSession()
    const load = createEngineModelLoad({format: 'ifc', spawn: async () => session})
    const parsing = load.parse(new Uint8Array(8))
    await settle()
    load.abort()
    load.abort()
    await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
    // Once by abort, once by the open's own failure path; never more.
    expect(session.closeCount).toBeLessThanOrEqual(2)
  })
})
