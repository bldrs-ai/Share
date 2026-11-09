import {yieldForPaint, yieldToBrowser} from './scheduling'


describe('utils/scheduling', () => {
  describe('yieldToBrowser', () => {
    it('resolves on the next macrotask, not synchronously', async () => {
      // Sentinel set inside a setTimeout to prove the await actually
      // yielded — if `yieldToBrowser` resolved in the same task, the
      // sentinel-setting timeout would not have fired before our await
      // returned (sibling setTimeouts run in order).
      let timerFired = false
      setTimeout(() => {
        timerFired = true
      }, 0)
      await yieldToBrowser()
      expect(timerFired).toBe(true)
    })

    it('is awaitable many times without leaking state', async () => {
      // Defensive: the helper is a primitive used in tight loops; make
      // sure it's a fresh promise each call. A buggy single-shot impl
      // would resolve subsequent calls synchronously and miss the
      // yield, surfacing here as the second timer NOT firing.
      const counter = {fired: 0}
      const bumpCounter = () => {
        counter.fired++
      }
      for (let i = 0; i < 3; i++) {
        setTimeout(bumpCounter, 0)
        await yieldToBrowser()
      }
      expect(counter.fired).toBe(3)
    })
  })

  describe('yieldForPaint', () => {
    let originalRaf
    let visibility

    beforeEach(() => {
      originalRaf = globalThis.requestAnimationFrame
      visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    })

    afterEach(() => {
      globalThis.requestAnimationFrame = originalRaf
      visibility.mockRestore()
    })

    it('waits for an animation frame, then a task past it', async () => {
      const frames = []
      globalThis.requestAnimationFrame = (cb) => frames.push(cb)
      let resolved = false
      const done = yieldForPaint().then(() => {
        resolved = true
      })
      await yieldToBrowser()
      await yieldToBrowser()
      // No frame yet, so no paint yet: still waiting.
      expect(resolved).toBe(false)
      expect(frames).toHaveLength(1)
      frames[0](0)
      await done
      expect(resolved).toBe(true)
    })

    it('does not wait on frames in a hidden tab, which runs none', async () => {
      visibility.mockReturnValue('hidden')
      const raf = jest.fn()
      globalThis.requestAnimationFrame = raf
      await yieldForPaint()
      expect(raf).not.toHaveBeenCalled()
    })

    it('gives up on a frame that never comes', async () => {
      const maxWaitMs = 20
      // Timers may fire a millisecond or two early against Date.now().
      const slackMs = 5
      globalThis.requestAnimationFrame = () => 0
      const started = Date.now()
      await yieldForPaint({maxWaitMs})
      expect(Date.now() - started).toBeGreaterThanOrEqual(maxWaitMs - slackMs)
    })
  })
})
