// The React half of the background codec sweep: one run at a time, restarted
// on the axes the figures depend on, held back above the size threshold, and
// stoppable.
//
// `codecSizes.test.js` pins the scheduler's own decisions. What is only
// observable here is the lifecycle around it — which is where the bugs in a
// feature like this actually live.
import {act, renderHook, waitFor} from '@testing-library/react'
import {artifactSizes, releaseCompressedExport, uncompressedSizes} from './artifactSizes'
import {AUTO_MEASURE_MAX_BYTES} from './codecSizes'
import useCodecSizes from './useCodecSizes'


jest.mock('./artifactSizes', () => ({
  artifactSizes: jest.fn(),
  releaseCompressedExport: jest.fn(),
  uncompressedSizes: jest.fn(),
}))


/* eslint-disable no-magic-numbers */
const ARTIFACT = {schemaVer: '0.21.0-batched', writtenAt: 1}
const SMALL_BYTES = 2 * 1024 * 1024
const BALANCED = {quality: 'balanced', isPortable: false, isMetadataIncluded: true}

const SIZES = {
  none: {withMetadata: 1959196, withoutMetadata: 1800000},
  meshopt: {withMetadata: 1347740, withoutMetadata: 1200000},
  draco: {withMetadata: 250184, withoutMetadata: 220000},
}


describe('useCodecSizes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    uncompressedSizes.mockResolvedValue({withMetadata: SMALL_BYTES})
    artifactSizes.mockImplementation((artifact, mode) => Promise.resolve(SIZES[mode] ?? null))
  })

  it('measures every codec on its own, with no interaction', async () => {
    // The tab opening is the whole trigger — the user learns which codec wins
    // without clicking through all three.
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))

    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    expect(result.current.measuringCodec).toBeNull()
    // And a sweep that got all the way through is NOT parked: the panel's
    // status row says nothing at all once there is nothing left to do.
    expect(result.current.isPaused).toBe(false)
  })

  it('starts nothing above the size threshold, and offers to on request', async () => {
    // Opening the Export tab on a Snowdon-scale model must not start a CPU
    // fire on the user's behalf — three encoders over 50 MB is seconds of
    // uninterruptible main-thread work.
    uncompressedSizes.mockResolvedValue({withMetadata: AUTO_MEASURE_MAX_BYTES + 1})
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))

    await waitFor(() => expect(result.current.isPaused).toBe(true))
    expect(artifactSizes).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.isPaused).toBe(false)
    expect(result.current.sizesByCodec).toEqual(SIZES)
  })

  it('restarts from scratch when the quality rung changes', async () => {
    // Every figure it published was measured AT the old rung, so leaving them
    // on the dropdown under the new one would be the stale-estimate lie the
    // size line's `data-estimate-key` exists to stop.
    const {result, rerender} = renderHook(
      ({quality}) => useCodecSizes(ARTIFACT, {...BALANCED, quality}),
      {initialProps: {quality: 'balanced'}})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))

    rerender({quality: 'smallest'})

    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    for (const mode of ['none', 'meshopt', 'draco']) {
      expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, mode, false, 'smallest')
    }
  })

  it('restarts when Portable changes', async () => {
    const {result, rerender} = renderHook(
      ({isPortable}) => useCodecSizes(ARTIFACT, {...BALANCED, isPortable}),
      {initialProps: {isPortable: false}})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))

    rerender({isPortable: true})

    await waitFor(() => expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, 'draco', true, 'balanced'))
  })

  it('does NOT restart when the metadata toggle moves', async () => {
    // One estimate produces both sides, so that toggle moves every figure
    // without a single re-encode — the behaviour #1842 shipped and the one
    // thing about the sweep that must stay free.
    const {result, rerender} = renderHook(
      ({isMetadataIncluded}) => useCodecSizes(ARTIFACT, {...BALANCED, isMetadataIncluded}),
      {initialProps: {isMetadataIncluded: true}})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    const encodesBefore = artifactSizes.mock.calls.length

    rerender({isMetadataIncluded: false})

    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    expect(artifactSizes).toHaveBeenCalledTimes(encodesBefore)
    expect(result.current.sizesByCodec).toEqual(SIZES)
  })

  it('stops the queue and keeps what it measured', async () => {
    // The honest contract: `stop` aborts the QUEUE, the codec in flight runs
    // to completion, and `isStopping` is what lets the panel say which one.
    // Also the same-generation half of the publish guard below (the
    // superseded-sweep test): an aborted run whose generation is still the
    // current one keeps publishing, so a guard written as "not aborted"
    // rather than "same generation" fails here.
    let resolveMeshopt
    artifactSizes.mockImplementation((artifact, mode) => {
      if (mode === 'meshopt') {
        return new Promise((resolve) => {
          resolveMeshopt = resolve
        })
      }
      return Promise.resolve(SIZES[mode])
    })
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.measuringCodec).toBe('meshopt'))

    act(() => result.current.stop())
    expect(result.current.isStopping).toBe(true)

    await act(async () => {
      resolveMeshopt(SIZES.meshopt)
      // Let the loop's `.then` and the yield after it run inside this `act`.
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    // Meshopt's figure was paid for and stays usable; Draco was never started.
    expect(result.current.sizesByCodec).toEqual({none: SIZES.none, meshopt: SIZES.meshopt})
    expect(artifactSizes).not.toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced')
  })

  it('parks a stopped sweep instead of leaving it unfinishable', async () => {
    // Stop was a one-way door: `isMeasuring` went false and nothing replaced
    // it, so the panel's status row — which is where BOTH its buttons live —
    // unmounted, and a sweep two codecs into three could never be finished
    // and never name a winner. Recovery meant reopening the dialog (#1852
    // review). It parks in the same state the size threshold parks it in,
    // because the way out is the same button.
    let resolveMeshopt
    artifactSizes.mockImplementation((artifact, mode) => {
      if (mode === 'meshopt') {
        return new Promise((resolve) => {
          resolveMeshopt = resolve
        })
      }
      return Promise.resolve(SIZES[mode])
    })
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.measuringCodec).toBe('meshopt'))

    act(() => result.current.stop())
    await act(async () => {
      resolveMeshopt(SIZES.meshopt)
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))

    expect(result.current.isPaused).toBe(true)

    // …and asking again finishes the axis, which is the whole point of
    // parking rather than vanishing.
    artifactSizes.mockImplementation((artifact, mode) => Promise.resolve(SIZES[mode] ?? null))
    await act(async () => {
      await result.current.start()
    })

    expect(result.current.isPaused).toBe(false)
    expect(result.current.sizesByCodec).toEqual(SIZES)
  })

  it('drops a superseded sweep\'s figure instead of publishing it into the new rung', async () => {
    // The other half of the Stop contract, and the one that is a bug rather
    // than a feature. Both a Stop and a rung change abort the run, but only a
    // rung change makes the codec still in flight — synchronous wasm, so it
    // runs to completion either way — the WRONG measurement. Its figure must
    // not reach `sizesByCodec`, which is the set `smallestCodec` reads the
    // auto-selected winner off: one figure from the old rung beside two from
    // the new one is a recommendation made on numbers that were never
    // comparable.
    const pending = {}
    artifactSizes.mockImplementation((artifact, mode, isPortable, quality) =>
      new Promise((resolve) => {
        pending[`${mode}|${quality}`] = resolve
      }))
    const {result, rerender} = renderHook(
      ({quality}) => useCodecSizes(ARTIFACT, {...BALANCED, quality}),
      {initialProps: {quality: 'balanced'}})

    await waitFor(() => expect(pending['none|balanced']).toBeDefined())
    await act(async () => {
      pending['none|balanced'](SIZES.none)
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.measuringCodec).toBe('meshopt'))

    rerender({quality: 'smallest'})
    await waitFor(() => expect(pending['none|smallest']).toBeDefined())
    expect(result.current.sizesByCodec).toEqual({})

    // Now the superseded Meshopt encode finishes, at the OLD rung.
    const staleSizes = {withMetadata: 111, withoutMetadata: 99}
    await act(async () => {
      pending['meshopt|balanced'](staleSizes)
      await Promise.resolve()
    })

    expect(result.current.sizesByCodec).toEqual({})
    expect(result.current.measuringCodec).toBe('none')
  })

  it('has nothing to measure before the loader publishes an artifact', async () => {
    uncompressedSizes.mockResolvedValue(null)
    const {result} = renderHook(() => useCodecSizes(null, BALANCED))

    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    expect(result.current.isPaused).toBe(false)
    expect(artifactSizes).not.toHaveBeenCalled()
    expect(releaseCompressedExport).not.toHaveBeenCalled()
  })
})
