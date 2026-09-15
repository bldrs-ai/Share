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
  })

  it('starts nothing above the size threshold, and offers to on request', async () => {
    // Opening the Export tab on a Snowdon-scale model must not start a CPU
    // fire on the user's behalf — three encoders over 50 MB is seconds of
    // uninterruptible main-thread work.
    uncompressedSizes.mockResolvedValue({withMetadata: AUTO_MEASURE_MAX_BYTES + 1})
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))

    await waitFor(() => expect(result.current.isSuppressed).toBe(true))
    expect(artifactSizes).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.isSuppressed).toBe(false)
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

  it('has nothing to measure before the loader publishes an artifact', async () => {
    uncompressedSizes.mockResolvedValue(null)
    const {result} = renderHook(() => useCodecSizes(null, BALANCED))

    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    expect(result.current.isSuppressed).toBe(false)
    expect(artifactSizes).not.toHaveBeenCalled()
    expect(releaseCompressedExport).not.toHaveBeenCalled()
  })
})
