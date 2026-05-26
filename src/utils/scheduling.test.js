import {yieldToBrowser} from './scheduling'


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
})
