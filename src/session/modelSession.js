// Per-model sessions (open-205 #2011 Phase 1b step 1, #2019;
// design/new/in-app-model-switch.md §4.9).
//
// A model session is the unit that owns one open model: its load job (the
// run's abort controller and the store writes it may make), the engine its
// load parsed into, and the window handlers bound for it. The view binds to
// the ACTIVE session, a pointer on the host; only a load job of the active
// session, and only the session's current job, writes the model's state.
// That is what makes a load the user has left harmless whatever it does
// next: its writes are dropped where they are made, not by a check at each
// call site in CadView (decision 4 on #2011: retire Phase 0's guards rather
// than add more).
//
// Step 1 holds ONE session: opening another closes the active one, which is
// the in-app switch's close (Phase 1a). Step 2 (#2031, `EngineHost`) keeps
// left sessions alive under `?feature=workspace` and rebinds the view to
// one on a return; the shape is meant to take that without a rewrite: the
// host's `active` stays a pointer, a background session's job simply is not
// current, and a session's state goes with it when it is closed.
//
// Naming: not the workspace's "session" (a conversation over models,
// design/new/workspace-sessions.md §2) and not `EngineSession` (one model's
// engine worker, engine/EngineSession.js). A model session holds at most one
// of the latter.
import {LoadAbortedError, isAborted} from '../utils/loadAbort'
import {modelLoadingState} from '../store/IFCSlice'
import useStore from '../store/useStore'


/**
 * `ModelSession#loadState`, the shape engine-worker.md §5.2's `EngineHost`
 * reads for its LRU tiers.
 */
export const LoadState = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
  CLOSED: 'closed',
})


// Ids for the life of the page, so a session is told apart from a later one
// of the same model (engine-worker.md §5.2: the host's table, the dev hook).
let lastSessionId = 0

// The load job whose loading UI is up: the overlay (`isModelLoading`) and
// the snackbar's "Loading …" line. Page-wide, not per host, because the UI
// is: an in-app open across route families remounts CadView, and each
// CadView has its own host and its own load queue, so the left view's load
// can still be unwinding after the next view's has begun (a mesh parse
// can't be stopped; codex on #2247). Only the owner takes the UI down, so
// that unwind can't clear the next load's; and a load given up with no
// other load after it still takes its own down, so nothing is left stuck.
// LoadJob#showLoading claims it.
let loadingUiOwner = null

// The host of the view that opened a session last: the view on the page now.
// A remount opens the next view's session before the left view's unmount
// close has run (useModelSessionHost closes a microtask later, for
// StrictMode), and in that window both views' sessions were each their own
// host's active one (codex on #2247). The left one stops being current the
// moment the next view opens its own.
let pageHost = null


/** One load run of a session: what CadView's `onViewer` starts. */
export class LoadJob {
  /**
   * @param {ModelSession} session
   * @param {object} options
   * @param {boolean} options.isAbortable whether leaving the model aborts the
   *   run (the in-app switch, utils/spaModelNavMode.js). Without it, as with
   *   the kill switch on, no signal is handed down and the run goes on to its
   *   end; its writes are dropped all the same once it is not current.
   */
  constructor(session, {isAbortable}) {
    this.session = session
    this.controller = isAbortable ? new AbortController() : null
    // Set once the run has put its model on screen (markReady). A job given
    // up before then may have left part of its state behind (the tree at the
    // index), which the next job of the same session must not start on
    // (ModelSession#beginLoad).
    this.isComplete = false
  }

  /** @return {AbortSignal|undefined} handed down the load (utils/loadAbort.js) */
  get signal() {
    return this.controller?.signal
  }

  /**
   * Whether this run may write the model's state: its session is the active
   * one, it is that session's current run, and it was not given up.
   *
   * @return {boolean}
   */
  isCurrent() {
    return this.session.isActive() && this.session.job === this && !isAborted(this.signal)
  }

  /**
   * The checkpoint between awaits: a run that is no longer current unwinds
   * here as aborted, so nothing after it writes for a model that isn't shown.
   */
  throwIfLeft() {
    if (!this.isCurrent()) {
      throw new LoadAbortedError()
    }
  }

  /**
   * Write `partial` into the store if this run is current; else drop it.
   *
   * @param {object} partial
   * @return {boolean} whether it was written
   */
  set(partial) {
    if (!this.isCurrent()) {
      return false
    }
    useStore.setState(partial)
    return true
  }

  /**
   * Run `fn` if this run is current: for the writes that are not store
   * fields (a scene or viewer call, an analytics send, a window handler).
   *
   * @param {Function} fn
   * @return {boolean} whether it ran
   */
  ifCurrent(fn) {
    if (!this.isCurrent()) {
      return false
    }
    fn()
    return true
  }

  /**
   * The run has put its model on screen (onViewerInternal's end). A later
   * run of the session given up before its own end does not take this one's
   * state down with it (ModelSession#beginLoad).
   */
  markReady() {
    if (this.isCurrent()) {
      this.isComplete = true
      this.session.loadState = LoadState.READY
    }
  }

  /** The run failed, as the user sees it (its alert is up). */
  markFailed() {
    if (this.isCurrent()) {
      this.session.loadState = LoadState.FAILED
    }
  }

  /**
   * Put the loading UI up for this run, and own it (see `loadingUiOwner`).
   * Only while the run is current: a run the user has left never claims it.
   *
   * @param {string} [snackMessage] the snackbar's line; left as it is if absent
   */
  showLoading(snackMessage = undefined) {
    if (!this.isCurrent()) {
      return
    }
    loadingUiOwner = this
    useStore.setState({
      ...modelLoadingState(true),
      ...(snackMessage === undefined ? {} : {snackMessage}),
    })
  }

  /**
   * Replace the snackbar's loading line (the stall watchdog's "still
   * working"), if this run's loading UI is up.
   *
   * @param {string} snackMessage
   */
  updateLoadingMessage(snackMessage) {
    if (loadingUiOwner === this) {
      useStore.setState({snackMessage})
    }
  }

  /**
   * Take the overlay down but keep the run's snackbar line and ownership:
   * an attempt ended, and an authed retry may put it up again.
   */
  hideLoading() {
    if (loadingUiOwner === this) {
      useStore.setState(modelLoadingState(false))
    }
  }

  /**
   * The run is over, however it ended: take its loading UI down, if it is
   * still the one up. Whether or not the run is current, so a run given up
   * with no load after it leaves nothing stuck.
   */
  endLoading() {
    if (loadingUiOwner === this) {
      loadingUiOwner = null
      useStore.setState({...modelLoadingState(false), snackMessage: null})
    }
  }

  /** Give the run up. A no-op without a controller or once aborted. */
  abort() {
    this.controller?.abort()
  }
}


/** One open model. Made and closed by its {@link ModelSessionHost}. */
export class ModelSession {
  /**
   * @param {ModelSessionHost} host
   * @param {string} modelKey routes/modelIdentity.ts's key of the model
   */
  constructor(host, modelKey) {
    this.id = ++lastSessionId
    this.host = host
    this.modelKey = modelKey
    /** @type {LoadJob|null} the run that may write; replaced per run */
    this.job = null
    this.isClosed = false
    this.loadState = LoadState.LOADING
    // The `EngineSession` (engine/EngineSession.js) the session's model was
    // parsed into, or null: a mesh format, a GLB cache hit, or the
    // main-thread engine (`?feature=disableEngineWorker`), which has nothing
    // to close (dropping it is what frees it, in-app-model-switch.md §2.3).
    // Set once a load has put its model in the store; null again once
    // closed.
    this.engine = null
    // The window handlers bound for this session, so closing it unbinds them
    // rather than leaving them on the next model's page until it binds its own.
    this.windowHandlers = {}
    // Other listeners bound for this session (the camera's `rest` count),
    // each a function that removes its own.
    this.closers = []
  }

  /** @return {boolean} whether the view is bound to this session */
  isActive() {
    return !this.isClosed && this.host.active === this && pageHost === this.host
  }

  /**
   * Start a new load run of this session. The previous one is given up
   * (aborted, if abortable) and stops being current at once. If it was given
   * up before its model was on screen, what it brought up so far (the tree
   * at its index, the first mesh) is forgotten before the new run starts: a
   * view re-created mid-load (a theme change) reloads the model from scratch.
   *
   * @param {object} options see LoadJob
   * @param {boolean} options.isAbortable
   * @return {LoadJob}
   */
  beginLoad({isAbortable}) {
    const previous = this.job
    const job = new LoadJob(this, {isAbortable})
    this.job = job
    this.loadState = LoadState.LOADING
    if (previous !== null) {
      const wasGivenUp = isAborted(previous.signal) && !previous.isComplete
      previous.abort()
      if (wasGivenUp && this.isActive()) {
        this.host.forget({isSwitch: false})
      }
    }
    return job
  }

  /**
   * Give up the session's run in flight, if any, without closing the
   * session: the viewer it loads into is being re-created (CadView's
   * initViewerCb). A run that has ended is aborted too, which only stops its
   * idle GLB writer if that has not run yet (Loader.js#load).
   */
  abortLoad() {
    this.job?.abort()
  }

  /**
   * Bind the engine a run's model was parsed into (see `engine`). A previous
   * binding is the model of an earlier run of this session, which the viewer
   * it was loaded into closes when it is disposed; dropped here.
   *
   * @param {object} model the loaded model
   */
  bindEngine(model) {
    this.engine = model?.ifcManager?.ifcAPI?.engineSession ?? null
  }

  /**
   * Bind a window handler for this session (`window.ondblclick`,
   * `window.onkeydown`), recorded so that close can unbind it.
   *
   * @param {string} name a `window` property
   * @param {Function} handler
   */
  bindWindowHandler(name, handler) {
    window[name] = handler
    this.windowHandlers[name] = handler
  }

  /**
   * Run `closer` when the session closes: for a listener bound for this
   * session on something that can outlive it.
   *
   * @param {Function} closer
   */
  bindCloser(closer) {
    if (typeof closer === 'function') {
      this.closers.push(closer)
    }
  }

  /**
   * Close the session: give its run up, unbind what it bound, close its
   * engine and drop every reference it holds, so nothing reachable from the
   * session keeps the model. Idempotent.
   */
  close() {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.loadState = LoadState.CLOSED
    this.job?.abort()
    for (const [name, handler] of Object.entries(this.windowHandlers)) {
      if (window[name] === handler) {
        window[name] = null
      }
    }
    this.windowHandlers = {}
    for (const closer of this.closers) {
      try {
        closer()
      } catch (e) {
        console.warn('ModelSession#close: a closer failed:', e)
      }
    }
    this.closers = []
    // The worker is terminated here; the viewer the model was loaded into
    // closes it too when disposed, and `EngineSession#close` is idempotent.
    try {
      this.engine?.close?.()
    } catch (e) {
      console.warn('ModelSession#close: engine close failed:', e)
    }
    this.engine = null
  }
}


/**
 * The sessions one view (CadView) can bind to, and which one it is bound to.
 * Step 1: at most one is open, the active one.
 */
export class ModelSessionHost {
  /**
   * @param {object} options
   * @param {Function} options.onForget `({isSwitch}) => void`: forget the
   *   per-model state of the model left, in the store and in the view, as a
   *   page load would start it. `isSwitch` is true when the active session
   *   changes (the view is about to show another model, or its first), false
   *   when the active session's run was given up mid-load and is restarted.
   *   CadView's `forgetLoadedModel`.
   */
  constructor({onForget}) {
    this.onForget = onForget
    /** @type {ModelSession|null} the session the view is bound to */
    this.active = null
  }

  /**
   * The session for `modelKey`, made active. The active session itself when
   * it is that model's (a theme or view-settings rebuild, an auth re-run).
   * Otherwise the active session is closed (step 1: a switch is a close) and
   * the per-model state forgotten before the new session becomes active, so
   * nothing renders the left model's state after the switch begins.
   *
   * @param {string} modelKey
   * @return {ModelSession}
   */
  open(modelKey) {
    pageHost = this
    if (this.active !== null && this.active.modelKey === modelKey) {
      return this.active
    }
    this.active?.close()
    const session = new ModelSession(this, modelKey)
    this.active = session
    this.onForget({isSwitch: true})
    return session
  }

  /**
   * Forget the active model's state (see the constructor's `onForget`).
   *
   * @param {object} options
   * @param {boolean} options.isSwitch
   */
  forget({isSwitch}) {
    this.onForget({isSwitch})
  }

  /**
   * Close the active session without forgetting its state: the view is
   * going away (CadView unmounting), and the store's per-model state is the
   * next view's to forget when it opens its own.
   */
  closeActive() {
    this.active?.close()
    this.active = null
  }
}
