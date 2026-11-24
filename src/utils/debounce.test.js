import {currentHistoryEntryKey, debounce, debounceInHistoryEntry} from './debounce'


/* eslint-disable no-magic-numbers */


describe('utils/debounce', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('runs once, the wait after the last call, with its arguments', () => {
    const fn = jest.fn()
    const d = debounce(fn, 250)
    d(1)
    jest.advanceTimersByTime(200)
    d(2)
    jest.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })

  it('drops a pending call on cancel, and runs one now on flush', () => {
    const fn = jest.fn()
    const d = debounce(fn, 250)
    d('a')
    d.cancel()
    jest.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    d('b')
    d.flush()
    expect(fn).toHaveBeenCalledWith('b')
    jest.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  describe('debounceInHistoryEntry', () => {
    it('runs the call in the entry it was made in, and drops it once the page is in another', () => {
      let entry = 'a'
      const fn = jest.fn()
      const d = debounceInHistoryEntry(fn, 250, () => entry)
      d(1)
      jest.advanceTimersByTime(250)
      expect(fn).toHaveBeenCalledWith(1)
      d(2)
      entry = 'b'
      jest.advanceTimersByTime(250)
      expect(fn).toHaveBeenCalledTimes(1)
      // A call made in the new entry is that entry's.
      d(3)
      jest.advanceTimersByTime(250)
      expect(fn).toHaveBeenLastCalledWith(3)
    })

    it('drops a flushed call made in another entry, and keeps cancel', () => {
      let entry = 'a'
      const fn = jest.fn()
      const d = debounceInHistoryEntry(fn, 250, () => entry)
      d('x')
      entry = 'b'
      d.flush()
      expect(fn).not.toHaveBeenCalled()
      d('y')
      d.flush()
      expect(fn).toHaveBeenCalledWith('y')
      d('z')
      d.cancel()
      jest.advanceTimersByTime(500)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('reads the entry from history.state.key, as react-router keys it', () => {
      window.history.replaceState({usr: null, key: 'k1', idx: 0}, '')
      expect(currentHistoryEntryKey()).toBe('k1')
      window.history.replaceState(null, '')
      expect(currentHistoryEntryKey()).toBeNull()
    })
  })
})
