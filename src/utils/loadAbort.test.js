import {
  LoadAbortedError,
  isAborted,
  isLoadAbortedError,
  raceLoadAbort,
  throwIfLoadAborted,
  unlessLoadAborted,
} from './loadAbort'


describe('utils/loadAbort', () => {
  it('without a signal, raceLoadAbort hands back the very promise', () => {
    const work = Promise.resolve(1)
    expect(raceLoadAbort(work, undefined)).toBe(work)
    expect(raceLoadAbort(work, null)).toBe(work)
  })

  it('settles with the work when it finishes first, and stops listening', async () => {
    const controller = new AbortController()
    const remove = jest.spyOn(controller.signal, 'removeEventListener')
    await expect(raceLoadAbort(Promise.resolve('done'), controller.signal)).resolves.toBe('done')
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('rejects at the abort while the work is still pending', async () => {
    const controller = new AbortController()
    const racing = raceLoadAbort(new Promise(() => {}), controller.signal)
    controller.abort()
    await expect(racing).rejects.toBeInstanceOf(LoadAbortedError)
  })

  it('rejects at once for a signal already aborted, and swallows the work\'s own rejection', async () => {
    const controller = new AbortController()
    controller.abort()
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const work = Promise.reject(new Error('the engine closed'))
      await expect(raceLoadAbort(work, controller.signal)).rejects.toBeInstanceOf(LoadAbortedError)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('leaves an abandoned work\'s later rejection handled', async () => {
    const controller = new AbortController()
    let rejectWork
    const work = new Promise((resolve, reject) => {
      rejectWork = reject
    })
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const racing = raceLoadAbort(work, controller.signal)
      controller.abort()
      await expect(racing).rejects.toBeInstanceOf(LoadAbortedError)
      rejectWork(new Error('late'))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('throwIfLoadAborted and isAborted read the signal', () => {
    const controller = new AbortController()
    expect(isAborted(controller.signal)).toBe(false)
    expect(isAborted(undefined)).toBe(false)
    expect(() => throwIfLoadAborted(controller.signal)).not.toThrow()
    expect(() => throwIfLoadAborted(undefined)).not.toThrow()
    controller.abort()
    expect(isAborted(controller.signal)).toBe(true)
    expect(() => throwIfLoadAborted(controller.signal)).toThrow(LoadAbortedError)
  })

  it('LoadAbortedError is named like the DOM\'s abort, and only it is a load abort', () => {
    const e = new LoadAbortedError()
    expect(e.name).toBe('AbortError')
    expect(isLoadAbortedError(e)).toBe(true)
    // A DOM AbortError from elsewhere (a fetch timeout) is not the user's.
    const other = new Error('x')
    other.name = 'AbortError'
    expect(isLoadAbortedError(other)).toBe(false)
  })

  it('unlessLoadAborted quiets a callback from the abort on, and is the identity without a signal', () => {
    const fn = jest.fn((x) => x * 2)
    expect(unlessLoadAborted(fn, undefined)).toBe(fn)
    const controller = new AbortController()
    const quiet = unlessLoadAborted(fn, controller.signal)
    expect(quiet(2)).toBe(4)
    controller.abort()
    expect(quiet(3)).toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
