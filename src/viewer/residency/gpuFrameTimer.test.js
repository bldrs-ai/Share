/* eslint-disable no-magic-numbers */
import {FENCE_TIMEOUT_MS, createGpuFrameTimer} from './gpuFrameTimer'


/**
 * A WebGL2 stand-in with fences whose signal time the test sets, and an
 * optional timer-query extension whose results the test sets.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.timerQuery]
 * @return {object}
 */
function fakeGl({timerQuery = false} = {}) {
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    TIMEOUT_EXPIRED: 2,
    ALREADY_SIGNALED: 3,
    WAIT_FAILED: 4,
    QUERY_RESULT_AVAILABLE: 5,
    QUERY_RESULT: 6,
    signalled: false,
    fences: 0,
    deleted: 0,
    flushes: 0,
    queries: [],
    disjoint: false,
    fenceSync: () => {
      gl.fences++
      return {}
    },
    flush: () => {
      gl.flushes++
    },
    clientWaitSync: () => (gl.signalled ? gl.ALREADY_SIGNALED : gl.TIMEOUT_EXPIRED),
    deleteSync: () => {
      gl.deleted++
    },
    createQuery: () => {
      const query = {available: false, ns: 0}
      gl.queries.push(query)
      return query
    },
    beginQuery: jest.fn(),
    endQuery: jest.fn(),
    deleteQuery: jest.fn(),
    getQueryParameter: (query, pname) => (pname === gl.QUERY_RESULT_AVAILABLE ? query.available : query.ns),
    getParameter: () => gl.disjoint,
    getExtension: (name) => (timerQuery && name === 'EXT_disjoint_timer_query_webgl2' ?
      {TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11} : null),
  }
  return gl
}


/**
 * A task queue the test drains by hand.
 *
 * @return {object} `{nextTask, runOne, length}`
 */
function manualTasks() {
  const queue = []
  return {
    nextTask: (callback) => queue.push(callback),
    runOne: () => queue.shift()?.(),
    get length() {
      return queue.length
    },
  }
}


describe('gpuFrameTimer', () => {
  describe('fence path', () => {
    it('times a frame from the paint to its fence signalling, polling as tasks', () => {
      const gl = fakeGl()
      const clock = {t: 0}
      const tasks = manualTasks()
      const samples = []
      const timer = createGpuFrameTimer(gl, {
        now: () => clock.t, nextTask: tasks.nextTask,
        onSample: (ms, tag) => samples.push([ms, tag]),
      })
      expect(timer.kind).toBe('fence')
      timer.start()
      timer.beforePaint('e1')
      clock.t = 100
      timer.afterPaint('e1')
      expect(gl.fences).toBe(1)
      expect(gl.flushes).toBe(1)
      // Not yet signalled: it re-queues rather than blocking.
      clock.t = 105
      tasks.runOne()
      expect(samples).toEqual([])
      expect(tasks.length).toBe(1)
      // A second paint while one fence is pending is not timed.
      timer.afterPaint('e1')
      expect(gl.fences).toBe(1)
      gl.signalled = true
      clock.t = 114
      tasks.runOne()
      expect(samples).toEqual([[14, 'e1']])
      expect(gl.deleted).toBe(1)
    })

    it('gives up on a fence after the timeout, reporting it as a slow frame', () => {
      const gl = fakeGl()
      const clock = {t: 0}
      const tasks = manualTasks()
      const samples = []
      const timer = createGpuFrameTimer(gl, {
        now: () => clock.t, nextTask: tasks.nextTask, onSample: (ms) => samples.push(ms),
      })
      timer.start()
      timer.afterPaint()
      clock.t = FENCE_TIMEOUT_MS + 1
      tasks.runOne()
      expect(samples).toEqual([FENCE_TIMEOUT_MS + 1])
      expect(gl.deleted).toBe(1)
    })

    it('places no fence while stopped', () => {
      const gl = fakeGl()
      const timer = createGpuFrameTimer(gl, {nextTask: () => undefined, onSample: () => undefined})
      timer.afterPaint()
      expect(gl.fences).toBe(0)
    })
  })

  describe('timer-query path', () => {
    it('reads the elapsed time of the query around a paint', () => {
      const gl = fakeGl({timerQuery: true})
      const samples = []
      const timer = createGpuFrameTimer(gl, {onSample: (ms, tag) => samples.push([ms, tag])})
      expect(timer.kind).toBe('timer-query')
      timer.start()
      timer.beforePaint('e2')
      timer.afterPaint('e2')
      expect(gl.beginQuery).toHaveBeenCalledTimes(1)
      expect(gl.endQuery).toHaveBeenCalledTimes(1)
      timer.poll()
      expect(samples).toEqual([])
      gl.queries[0].available = true
      gl.queries[0].ns = 12.5e6
      timer.poll()
      expect(samples).toEqual([[12.5, 'e2']])
      expect(gl.fences).toBe(0)
    })

    it('drops queries a disjoint event voided', () => {
      const gl = fakeGl({timerQuery: true})
      const samples = []
      const timer = createGpuFrameTimer(gl, {onSample: (ms) => samples.push(ms)})
      timer.start()
      timer.beforePaint()
      timer.afterPaint()
      gl.queries[0].available = true
      gl.disjoint = true
      timer.poll()
      expect(samples).toEqual([])
      expect(gl.deleteQuery).toHaveBeenCalledTimes(1)
    })

    it('closes a query a throwing paint left open before starting the next', () => {
      const gl = fakeGl({timerQuery: true})
      const timer = createGpuFrameTimer(gl, {onSample: () => undefined})
      timer.start()
      timer.beforePaint()
      // No afterPaint: the draw threw.
      timer.beforePaint()
      expect(gl.endQuery).toHaveBeenCalledTimes(1)
      expect(gl.beginQuery).toHaveBeenCalledTimes(2)
    })

    it('falls back to fences when asked to', () => {
      const gl = fakeGl({timerQuery: true})
      const timer = createGpuFrameTimer(gl, {useTimerQuery: false, onSample: () => undefined})
      expect(timer.kind).toBe('fence')
    })
  })

  it('is null for a context that can do neither', () => {
    expect(createGpuFrameTimer(null, {onSample: () => undefined})).toBeNull()
    expect(createGpuFrameTimer({}, {onSample: () => undefined})).toBeNull()
  })
})
