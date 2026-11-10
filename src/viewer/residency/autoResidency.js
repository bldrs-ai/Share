/**
 * autoResidency — the frame-budget policy behind the Display menu's
 * "While moving: Auto" choice (B3 of design/new/demand-tiled-rendering.md).
 *
 * Pure: it is fed GPU frame times and a clock, and answers with the residency
 * fraction the camera-motion overlay should hold. MotionResidency.js does the
 * wiring (camera events, the GPU timer, the controller).
 *
 * **The model it leans on.** The owner's repaint probe on an M2 Air put PSB's
 * GPU time at about 6 ms + 3.4 ms per million triangles: cost is monotone in
 * what is resident, with a fixed part. Each step therefore scales the fraction
 * by budget / measured, the proportional guess, bounded per step. With a
 * fixed part `a`, cost(f) = a + b·f and the proportional step under-predicts
 * a decrease's saving and over-predicts an increase's cost, so a decrease
 * that is not enough is followed by another decrease and an increase never
 * lands above budget: from either side the walk is monotone toward the
 * budget, and does not cross it. That is the no-oscillation argument for the
 * noiseless model; what keeps measurement noise from walking it back and
 * forth is the rest:
 *
 *  - **samples are the median** of at least `MIN_SAMPLES` frames painted at
 *    the CURRENT fraction (each change opens a new epoch and drops the old
 *    samples, so a step is never judged on frames from before it);
 *  - **rescore throttle**: at most one step per `UPDATE_MS` (B2's ~150 ms);
 *  - **hysteresis**: shrink above the budget, grow only below `GROW_BELOW` of
 *    it, hold in between;
 *  - **bounded change**: at most ×`MAX_SHRINK` down and ×`MAX_GROW` up per
 *    step, aiming at `AIM` of the budget rather than at its edge;
 *  - **a ceiling** at the smallest fraction seen over budget: growth stops
 *    just under it, so a too-slow fraction is not tried again until the
 *    ceiling has relaxed (`CEILING_RELAX_MS` held under budget, then
 *    ×`CEILING_RELAX`). In a still scene the probes this allows approach the
 *    boundary from below.
 *
 * The fraction is kept between gestures, so a drag starts from the last
 * fraction that was in budget and its first frames are already cheap.
 */


/**
 * Share of a display interval the GPU may spend on a frame: all of it.
 *
 * The first cut used 0.8 (13.3 ms at 60 Hz) and the owner's preview run on
 * PSB (M2 Air, 60 Hz, DPR 2) drove Auto to the floor: the GPU's fixed cost
 * there is about 6.4 ms + 3.4 ms per million triangles, Momentum's whole
 * frame is already 9.2 ms, and with the step aiming at `AIM` of the budget
 * 13.3 ms leaves too few triangles. A full frame (16.7 ms; the step aims at
 * ~14.2 ms) is about 2.3 M triangles — PSB at 25% (2.36 M, measured
 * 14.4 ms), which is the trade-off the owner found good.
 */
export const BUDGET_SHARE = 1
/**
 * Never keep less than this while moving: the model must not vanish, and
 * below about a tenth the orbit stops being legible as the model at all
 * (5% on PSB read as too aggressive in the owner's preview run).
 */
export const MIN_FRACTION = 0.1
/** At most one step per this long (B2's rescore throttle). */
export const UPDATE_MS = 150
/** Frames at the current fraction a step needs. */
export const MIN_SAMPLES = 3
/** Grow only when the median is below this share of the budget. */
export const GROW_BELOW = 0.7
/** Steps aim at this share of the budget. */
export const AIM = 0.85
/** Smallest factor one step may apply. */
export const MAX_SHRINK = 0.5
/** Largest factor one step may apply. */
export const MAX_GROW = 1.25
/** Growth stops this far under the ceiling. */
export const CEILING_MARGIN = 0.9
/** Held under budget at the ceiling this long, the ceiling relaxes. */
export const CEILING_RELAX_MS = 2000
/** Factor the ceiling relaxes by. */
export const CEILING_RELAX = 1.1

const MS_PER_S = 1000
/** Assumed display rate before one is measured. */
const DEFAULT_HZ = 60
/** Fastest display the estimate believes. */
const MAX_HZ = 240
/** Slowest display the estimate believes. */
const MIN_HZ = 30
/** Assumed display interval before one is measured. */
export const DEFAULT_FRAME_INTERVAL_MS = MS_PER_S / DEFAULT_HZ
/** Idle intervals the display-rate estimate keeps. */
const RATE_WINDOW = 60
/** Percentile of idle intervals taken as the display interval. */
const RATE_PERCENTILE = 0.25
const MIN_FRAME_INTERVAL_MS = MS_PER_S / MAX_HZ
const MAX_FRAME_INTERVAL_MS = MS_PER_S / MIN_HZ


/**
 * The display's frame interval, read off animation-frame timestamps.
 *
 * Only intervals that follow a frame which did NOT paint are counted: an idle
 * frame comes at the display's own rate, while a frame after an expensive
 * paint comes late, and counting those would read a 47 ms orbit on a 60 Hz
 * panel as a 21 Hz display — and hand the GPU a 38 ms budget. The viewer's
 * loop ticks every animation frame whether it paints or not
 * (IfcContext#render), so idle intervals are plentiful between gestures, and
 * the estimate holds through one.
 *
 * Known limit: with render-on-demand off (`?feature=disableRenderOnDemand`)
 * every frame paints, there is no idle interval to read, and the estimate
 * stays at {@link DEFAULT_FRAME_INTERVAL_MS} — on a 120 Hz display Auto then
 * aims at a 60 Hz budget. Counting painted intervals instead would read a
 * slow GPU as a slow display, which is the worse error; render-on-demand is
 * the default, and its kill switch is a diagnostic mode.
 */
export class FrameRateEstimate {
  /** Starts at {@link DEFAULT_FRAME_INTERVAL_MS} until idle frames are seen. */
  constructor() {
    this.intervals_ = []
    this.lastMs_ = null
    this.intervalMs = DEFAULT_FRAME_INTERVAL_MS
  }


  /**
   * Note one animation frame.
   *
   * @param {number} nowMs the frame's time
   * @param {boolean} previousPainted whether the frame before this one
   *   painted
   */
  tick(nowMs, previousPainted) {
    const last = this.lastMs_
    this.lastMs_ = nowMs
    if (last === null || previousPainted) {
      return
    }
    const interval = nowMs - last
    if (!(interval > 0)) {
      return
    }
    this.intervals_.push(interval)
    if (this.intervals_.length > RATE_WINDOW) {
      this.intervals_.shift()
    }
    const sorted = this.intervals_.slice().sort((a, b) => a - b)
    const at = sorted[Math.floor(RATE_PERCENTILE * (sorted.length - 1))]
    this.intervalMs = Math.min(MAX_FRAME_INTERVAL_MS, Math.max(MIN_FRAME_INTERVAL_MS, at))
  }


  /** @return {number} the GPU budget for one frame, in ms */
  get budgetMs() {
    return BUDGET_SHARE * this.intervalMs
  }
}


/** See the module doc. */
export class AutoResidency {
  /**
   * @param {object} [opts]
   * @param {Function} [opts.now] clock in ms
   * @param {number} [opts.fraction] where the first gesture starts
   */
  constructor({now = () => performance.now(), fraction = 1} = {}) {
    this.now = now
    this.fraction = fraction
    this.budgetMs = BUDGET_SHARE * DEFAULT_FRAME_INTERVAL_MS
    // The most it is worth asking for (the at-rest set's share).
    this.capacity = 1
    // Smallest fraction measured over budget; growth stays under it.
    this.ceiling = Infinity
    // Bumped by each change; samples from another epoch are dropped.
    this.epoch = 0
    this.samples_ = []
    this.lastStepMs_ = -Infinity
    this.heldUnderSinceMs_ = null
  }


  /**
   * A gesture starts: judge it on its own frames, starting from the fraction
   * the last one ended at (clamped to what the at-rest set can give).
   *
   * @param {number} [capacity] 0..1, the at-rest set's share
   */
  startGesture(capacity = 1) {
    this.capacity = Math.max(MIN_FRACTION, Math.min(1, capacity))
    this.fraction = Math.max(MIN_FRACTION, Math.min(this.fraction, this.capacity))
    this.samples_ = []
    this.epoch++
    this.lastStepMs_ = this.now()
    this.heldUnderSinceMs_ = null
  }


  /** @param {number} ms the GPU budget for one frame */
  setBudgetMs(ms) {
    if (Number.isFinite(ms) && ms > 0) {
      this.budgetMs = ms
    }
  }


  /**
   * One painted frame's GPU time.
   *
   * @param {number} ms
   * @param {number} epoch the epoch the frame was painted in
   */
  addSample(ms, epoch) {
    if (epoch === this.epoch && Number.isFinite(ms) && ms >= 0) {
      this.samples_.push(ms)
    }
  }


  /**
   * Take a step if one is due.
   *
   * @return {boolean} whether the fraction changed
   */
  update() {
    const now = this.now()
    if (now - this.lastStepMs_ < UPDATE_MS || this.samples_.length < MIN_SAMPLES) {
      return false
    }
    const sorted = this.samples_.slice().sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const budget = this.budgetMs
    const ratio = (AIM * budget) / Math.max(median, Number.EPSILON)
    let next = this.fraction
    if (median > budget) {
      this.ceiling = Math.min(this.ceiling, this.fraction)
      next = this.fraction * Math.max(MAX_SHRINK, Math.min(1, ratio))
      this.heldUnderSinceMs_ = null
    } else if (median < GROW_BELOW * budget) {
      const cap = Math.min(this.capacity, CEILING_MARGIN * this.ceiling)
      if (this.fraction < cap) {
        next = Math.min(cap, this.fraction * Math.min(MAX_GROW, Math.max(1, ratio)))
        this.heldUnderSinceMs_ = null
      } else if (this.ceiling !== Infinity) {
        // Pinned under the ceiling with room to spare: relax it slowly.
        this.heldUnderSinceMs_ ??= now
        if (now - this.heldUnderSinceMs_ >= CEILING_RELAX_MS) {
          this.ceiling *= CEILING_RELAX
          this.heldUnderSinceMs_ = null
        }
      }
    } else {
      this.heldUnderSinceMs_ = null
    }
    next = Math.max(MIN_FRACTION, Math.min(this.capacity, next))
    // Judge the next step on fresh frames either way, so a hold is
    // re-evaluated on a full window rather than on an ever-growing one.
    this.samples_ = []
    this.lastStepMs_ = now
    if (next === this.fraction) {
      return false
    }
    this.fraction = next
    this.epoch++
    return true
  }
}
