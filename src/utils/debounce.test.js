import {debounce} from './debounce'


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
})
