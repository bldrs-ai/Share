// Tests for GlbWriterService — verifies the request/reply correlation,
// the transferable hint, and the worker-error fallback path.
//
// The real Worker constructor isn't usable in jsdom (no module-worker
// support there), so we stub it with a class that surfaces `postMessage`
// + dispatches synthetic responses via `addEventListener('message')`.
// That lets us drive both success and failure paths from the test and
// observe the service's behavior directly.

/* eslint-disable no-magic-numbers */

let lastWorkerInstance = null
/** Stub Worker — captures postMessages + dispatches synthetic replies. */
class FakeWorker {
  /** */
  constructor() {
    this.posted = []
    this.listeners = {message: [], error: []}
    this.terminated = false
    lastWorkerInstance = this
  }
  /**
   * @param {object} data
   * @param {Array} transferables
   */
  postMessage(data, transferables) {
    this.posted.push({data, transferables: transferables ?? null})
  }
  /**
   * @param {string} name
   * @param {Function} fn
   */
  addEventListener(name, fn) {
    if (this.listeners[name]) {
      this.listeners[name].push(fn)
    }
  }
  /** */
  terminate() {
    this.terminated = true
  }
  /** @param {object} data */
  fireMessage(data) {
    for (const fn of this.listeners.message) {
      fn({data})
    }
  }
  /** @param {object|string} messageOrEvent */
  fireError(messageOrEvent) {
    const event = typeof messageOrEvent === 'string' ? {message: messageOrEvent} : messageOrEvent
    for (const fn of this.listeners.error) {
      fn(event)
    }
  }
}


describe('loader/GlbWriterService', () => {
  let originalWorker
  let originalCreateObjectURL
  let originalRevokeObjectURL
  beforeEach(() => {
    originalWorker = global.Worker
    originalCreateObjectURL = global.URL.createObjectURL
    originalRevokeObjectURL = global.URL.revokeObjectURL
    global.Worker = FakeWorker
    // Module-worker support detection in GlbWriterService spins up a
    // throwaway Worker via `URL.createObjectURL(new Blob(...))`. The
    // FakeWorker constructor doesn't care about the URL but
    // createObjectURL needs to not throw.
    global.URL.createObjectURL = () => 'blob:fake'
    global.URL.revokeObjectURL = () => {}
    lastWorkerInstance = null
    jest.resetModules()
  })
  afterEach(() => {
    global.Worker = originalWorker
    global.URL.createObjectURL = originalCreateObjectURL
    global.URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('resolves the matching pending request when the worker replies ok', async () => {
    const {injectAndPackInWorker, terminateGlbWriterWorker} = await import('./GlbWriterService')
    const bytes = new Uint8Array([1, 2, 3, 4])
    const promise = injectAndPackInWorker({
      bytes,
      mode: null,
      extensions: [{name: 'X', data: {hello: 'world'}, compress: false}],
    })
    // Worker was spun up + the message was posted with the
    // transferable hint.
    expect(lastWorkerInstance).not.toBeNull()
    expect(lastWorkerInstance.posted).toHaveLength(1)
    expect(lastWorkerInstance.posted[0].transferables).toEqual([bytes.buffer])
    const sent = lastWorkerInstance.posted[0].data
    expect(sent.command).toBe('inject-and-pack')
    expect(typeof sent.id).toBe('number')

    // Simulate the worker's success reply.
    const reply = new Uint8Array([9, 8, 7])
    lastWorkerInstance.fireMessage({
      command: 'inject-and-pack:done',
      id: sent.id,
      ok: true,
      bytes: reply,
      extStats: {addedExtensions: 1},
    })
    await expect(promise).resolves.toEqual({
      bytes: reply,
      extStats: {addedExtensions: 1},
    })

    terminateGlbWriterWorker()
  })

  it('passes sceneExtras and sceneName through to the worker message (null when omitted)', async () => {
    const {injectAndPackInWorker, terminateGlbWriterWorker} = await import('./GlbWriterService')
    injectAndPackInWorker({
      bytes: new Uint8Array([1]),
      mode: null,
      extensions: [],
      sceneExtras: {bldrsTitle: 'Momentum'},
      sceneName: 'Momentum',
    })
    injectAndPackInWorker({bytes: new Uint8Array([2]), mode: null, extensions: []})
    const withMeta = lastWorkerInstance.posted[0].data
    expect(withMeta.sceneExtras).toEqual({bldrsTitle: 'Momentum'})
    expect(withMeta.sceneName).toBe('Momentum')
    const withoutMeta = lastWorkerInstance.posted[1].data
    expect(withoutMeta.sceneExtras).toBeNull()
    expect(withoutMeta.sceneName).toBeNull()
    terminateGlbWriterWorker()
  })

  it('rejects with the worker-reported error when ok is false', async () => {
    const {injectAndPackInWorker, terminateGlbWriterWorker} = await import('./GlbWriterService')
    const promise = injectAndPackInWorker({
      bytes: new Uint8Array([1]),
      mode: null,
      extensions: [],
    })
    const sent = lastWorkerInstance.posted[0].data
    lastWorkerInstance.fireMessage({
      command: 'inject-and-pack:done',
      id: sent.id,
      ok: false,
      error: 'simulated worker failure',
    })
    await expect(promise).rejects.toThrow('simulated worker failure')
    terminateGlbWriterWorker()
  })

  it('rejects in-flight requests when the worker errors out', async () => {
    const {injectAndPackInWorker, terminateGlbWriterWorker} = await import('./GlbWriterService')
    const p1 = injectAndPackInWorker({bytes: new Uint8Array([1]), mode: null, extensions: []})
    const p2 = injectAndPackInWorker({bytes: new Uint8Array([2]), mode: null, extensions: []})
    lastWorkerInstance.fireError('worker crashed')
    await expect(p1).rejects.toThrow('worker crashed')
    await expect(p2).rejects.toThrow('worker crashed')
    terminateGlbWriterWorker()
  })

  it('correlates replies by id even when interleaved', async () => {
    const {injectAndPackInWorker, terminateGlbWriterWorker} = await import('./GlbWriterService')
    const p1 = injectAndPackInWorker({bytes: new Uint8Array([1]), mode: null, extensions: []})
    const p2 = injectAndPackInWorker({bytes: new Uint8Array([2]), mode: null, extensions: []})
    const id1 = lastWorkerInstance.posted[0].data.id
    const id2 = lastWorkerInstance.posted[1].data.id
    expect(id1).not.toBe(id2)
    // Fire replies in reverse order to make sure the service routes
    // by id, not by FIFO.
    lastWorkerInstance.fireMessage({
      command: 'inject-and-pack:done',
      id: id2,
      ok: true,
      bytes: new Uint8Array([22]),
      extStats: {},
    })
    lastWorkerInstance.fireMessage({
      command: 'inject-and-pack:done',
      id: id1,
      ok: true,
      bytes: new Uint8Array([11]),
      extStats: {},
    })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.bytes[0]).toBe(11)
    expect(r2.bytes[0]).toBe(22)
    terminateGlbWriterWorker()
  })
})
