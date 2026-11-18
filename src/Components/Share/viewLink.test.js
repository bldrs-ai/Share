/* eslint-disable no-magic-numbers */
import {createLiveTerm, noteUserDisplayChange, setDisplayTerm} from './viewLink'


describe('Share/viewLink', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    setDisplayTerm(null)
    jest.useRealTimers()
  })

  describe('createLiveTerm', () => {
    it('writes nothing for changes before the user\'s own', () => {
      const write = jest.fn()
      const term = createLiveTerm({write, waitMs: 100})
      term.changed()
      term.changed()
      jest.advanceTimersByTime(1000)
      expect(write).not.toHaveBeenCalled()
      expect(term.isLive()).toBe(false)
    })

    it('goes live on the user\'s change, then follows every change, debounced', () => {
      const write = jest.fn()
      const term = createLiveTerm({write, waitMs: 100})
      term.start()
      expect(write).not.toHaveBeenCalled()
      jest.advanceTimersByTime(100)
      expect(write).toHaveBeenCalledTimes(1)
      // A burst after it: one write, once it settles.
      term.changed()
      jest.advanceTimersByTime(50)
      term.changed()
      jest.advanceTimersByTime(50)
      term.changed()
      expect(write).toHaveBeenCalledTimes(1)
      jest.advanceTimersByTime(100)
      expect(write).toHaveBeenCalledTimes(2)
    })

    it('drops a pending write when its switch is turned off before it fires', () => {
      const write = jest.fn()
      let isOn = true
      const term = createLiveTerm({write, isEnabled: () => isOn, waitMs: 100})
      term.start()
      isOn = false
      jest.advanceTimersByTime(100)
      expect(write).not.toHaveBeenCalled()
      // Still live: back on, the next change is written.
      isOn = true
      term.changed()
      jest.advanceTimersByTime(100)
      expect(write).toHaveBeenCalledTimes(1)
    })

    it('flushes a pending write, and writes nothing once disposed', () => {
      const write = jest.fn()
      const term = createLiveTerm({write, waitMs: 100})
      term.start()
      term.flush()
      expect(write).toHaveBeenCalledTimes(1)
      term.changed()
      term.dispose()
      jest.advanceTimersByTime(1000)
      term.start()
      jest.advanceTimersByTime(1000)
      expect(write).toHaveBeenCalledTimes(1)
    })
  })

  describe('commit', () => {
    it('goes live and writes at once, dropping a pending settle', () => {
      const write = jest.fn()
      const term = createLiveTerm({write, waitMs: 100})
      term.start()
      term.commit()
      expect(write).toHaveBeenCalledTimes(1)
      expect(term.isLive()).toBe(true)
      jest.advanceTimersByTime(100)
      expect(write).toHaveBeenCalledTimes(1)
    })

    it('writes nothing while its switch is off, or once disposed', () => {
      const write = jest.fn()
      let isEnabled = false
      const term = createLiveTerm({write, isEnabled: () => isEnabled, waitMs: 100})
      term.commit()
      expect(write).not.toHaveBeenCalled()
      isEnabled = true
      term.dispose()
      term.commit()
      expect(write).not.toHaveBeenCalled()
    })
  })

  describe('noteUserDisplayChange', () => {
    it('commits the registered display term at once, and disposes the one it replaces', () => {
      const first = jest.fn()
      const second = jest.fn()
      const firstTerm = createLiveTerm({write: first, waitMs: 100})
      setDisplayTerm(firstTerm)
      noteUserDisplayChange()
      expect(first).toHaveBeenCalledTimes(1)
      // A later change of the first model's, pending when it goes.
      firstTerm.changed()
      setDisplayTerm(createLiveTerm({write: second, waitMs: 100}))
      jest.advanceTimersByTime(100)
      // Disposed with its write pending: the model it described is gone.
      expect(first).toHaveBeenCalledTimes(1)
      noteUserDisplayChange()
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('is a no-op with no model on screen', () => {
      expect(() => noteUserDisplayChange()).not.toThrow()
    })
  })
})
