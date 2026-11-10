/**
 * gpuFrameTimer — how long the GPU spent on a painted frame, measured without
 * blocking the main thread (B3 of design/new/demand-tiled-rendering.md).
 *
 * Why the GPU and not the draw call: the composer's `render()` only queues
 * GL commands. On the owner's M2 Air PSB's draw calls took 4.9 ms while the
 * GPU work behind them took 47 ms, and it is the GPU time that holds the next
 * frame back (renderDemand.js's module doc has the same lesson from the load
 * side). Two techniques, best first:
 *
 *  - **`EXT_disjoint_timer_query_webgl2`** where the browser exposes it
 *    (desktop Chrome on most GPUs): a `TIME_ELAPSED` query around the paint,
 *    read back a frame or two later from the per-frame `poll()`. Exact GPU
 *    time, nothing spins. A disjoint event (the GPU was preempted, its clock
 *    changed) voids every query in flight, so those frames give no sample.
 *  - **a fence** otherwise (Safari, Firefox, SwiftShader): a
 *    `SYNC_GPU_COMMANDS_COMPLETE` fence right after the paint, polled from a
 *    MessageChannel loop until it signals. The sample is the time from the
 *    paint's last command to the fence: the GPU work still queued when the
 *    main thread let go, which is what the owner's repaint probe measured
 *    (`mainThreadTrace.js#probeRepaint` on the open-205 spike branch) and what
 *    the budget's numbers come from. A MessageChannel task is not clamped the
 *    way a nested `setTimeout` is (~4 ms), so the sample is good to about a
 *    millisecond; WebGL only updates a sync's status between tasks, which is
 *    why it is a task loop and not a busy wait. One fence is in flight at a
 *    time — a frame painted while one is pending gives no sample — so the
 *    loop never runs ahead of the GPU, and it gives up after
 *    `FENCE_TIMEOUT_MS`, reporting that as the sample (a frame that slow is
 *    over any budget, which is the signal the policy needs).
 *
 * The timer only runs between `start()` and `stop()`; MotionResidency.js
 * runs it while the camera moves under the Auto policy, so a still viewer
 * places no fences and polls nothing.
 */


/** A fence that hasn't signalled by now is given up on. */
export const FENCE_TIMEOUT_MS = 500
const NS_PER_MS = 1e6
/** Timer queries in flight before a frame goes unmeasured. */
const MAX_PENDING_QUERIES = 4


/**
 * @param {object} gl a WebGL2RenderingContext (or a stand-in)
 * @param {object} opts
 * @param {Function} opts.onSample (gpuMs, tag) for each measured frame
 * @param {Function} [opts.now] clock in ms
 * @param {Function} [opts.nextTask] schedules a callback as a new task
 * @param {boolean} [opts.useTimerQuery] false forces the fence path
 * @return {GpuFrameTimer|null} null when the context can measure neither way
 */
export function createGpuFrameTimer(gl, opts) {
  if (!gl) {
    return null
  }
  let ext = null
  if (opts.useTimerQuery !== false && typeof gl.createQuery === 'function') {
    try {
      ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null
    } catch {
      ext = null
    }
  }
  if (ext === null && typeof gl.fenceSync !== 'function') {
    return null
  }
  return new GpuFrameTimer(gl, ext, opts)
}


/**
 * A zero-delay task, as the owner's probe polled its fences. jsdom has no
 * MessageChannel; tests pass `nextTask`.
 *
 * @return {Function} (callback) => void
 */
function messageChannelTask() {
  if (typeof MessageChannel !== 'function') {
    return (callback) => setTimeout(callback, 0)
  }
  const channel = new MessageChannel()
  const queue = []
  channel.port1.onmessage = () => queue.shift()?.()
  return (callback) => {
    queue.push(callback)
    channel.port2.postMessage(0)
  }
}


/** See the module doc. */
export class GpuFrameTimer {
  /**
   * @param {object} gl
   * @param {object|null} ext the timer-query extension, or null for fences
   * @param {object} opts see {@link createGpuFrameTimer}
   */
  constructor(gl, ext, {onSample, now = () => performance.now(), nextTask = null}) {
    this.gl = gl
    this.ext = ext
    this.onSample = onSample
    this.now = now
    this.nextTask_ = nextTask
    this.kind = ext ? 'timer-query' : 'fence'
    this.running = false
    this.activeQuery_ = null
    this.pendingQueries_ = []
    this.fence_ = null
  }


  /** Start measuring painted frames. */
  start() {
    this.running = true
  }


  /**
   * Stop measuring; anything in flight is dropped, including a query a
   * throwing paint left open (so stop and dispose leave the same state).
   */
  stop() {
    this.running = false
    this.closeActiveQuery_()
    this.dropQueries_()
    this.dropFence_()
  }


  /**
   * A paint is about to start.
   *
   * @param {*} tag handed back with this frame's sample
   */
  beforePaint(tag) {
    if (!this.running || !this.ext) {
      return
    }
    const gl = this.gl
    // The last paint threw before `afterPaint`: close its query unread, or
    // `beginQuery` below is an INVALID_OPERATION.
    this.closeActiveQuery_()
    if (this.pendingQueries_.length >= MAX_PENDING_QUERIES) {
      return
    }
    const query = gl.createQuery()
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.activeQuery_ = {query, tag}
  }


  /**
   * A paint just finished.
   *
   * @param {*} tag handed back with this frame's sample
   */
  afterPaint(tag) {
    if (!this.running) {
      return
    }
    const gl = this.gl
    if (this.ext) {
      if (this.activeQuery_) {
        gl.endQuery(this.ext.TIME_ELAPSED_EXT)
        this.pendingQueries_.push(this.activeQuery_)
        this.activeQuery_ = null
      }
      return
    }
    if (this.fence_) {
      return
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!sync) {
      return
    }
    // Without a flush the fence can sit in the command buffer until the next
    // frame's commands push it out, and the sample would include the wait.
    gl.flush()
    this.fence_ = {sync, tag, startMs: this.now()}
    this.nextTask_ ??= messageChannelTask()
    this.nextTask_(() => this.pollFence_())
  }


  /** Read back finished timer queries; call once per animation frame. */
  poll() {
    if (!this.ext || this.pendingQueries_.length === 0) {
      return
    }
    const gl = this.gl
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.dropQueries_()
      return
    }
    while (this.pendingQueries_.length > 0) {
      const {query, tag} = this.pendingQueries_[0]
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        return
      }
      this.pendingQueries_.shift()
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT)
      gl.deleteQuery(query)
      this.onSample(ns / NS_PER_MS, tag)
    }
  }


  /** Detach everything; the timer is not used again. */
  dispose() {
    this.stop()
  }


  /** @private */
  closeActiveQuery_() {
    if (!this.activeQuery_) {
      return
    }
    try {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
      this.gl.deleteQuery(this.activeQuery_.query)
    } catch {
      // A lost context: nothing to free.
    }
    this.activeQuery_ = null
  }


  /** @private */
  pollFence_() {
    const fence = this.fence_
    if (!fence) {
      return
    }
    const gl = this.gl
    const status = gl.clientWaitSync(fence.sync, 0, 0)
    const elapsed = this.now() - fence.startMs
    if (status === gl.TIMEOUT_EXPIRED && elapsed < FENCE_TIMEOUT_MS) {
      this.nextTask_(() => this.pollFence_())
      return
    }
    this.dropFence_()
    if (status !== gl.WAIT_FAILED) {
      this.onSample(elapsed, fence.tag)
    }
  }


  /** @private */
  dropFence_() {
    if (this.fence_) {
      this.gl.deleteSync(this.fence_.sync)
      this.fence_ = null
    }
  }


  /** @private */
  dropQueries_() {
    for (const {query} of this.pendingQueries_) {
      this.gl.deleteQuery(query)
    }
    this.pendingQueries_ = []
  }
}
