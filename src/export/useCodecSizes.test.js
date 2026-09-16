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
      expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, mode, false, 'smallest', false)
    }
  })

  it('restarts when Portable changes', async () => {
    const {result, rerender} = renderHook(
      ({isPortable}) => useCodecSizes(ARTIFACT, {...BALANCED, isPortable}),
      {initialProps: {isPortable: false}})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))

    rerender({isPortable: true})

    await waitFor(() => expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, 'draco', true, 'balanced', false))
  })

  it('restarts when the download is gzipped, because that can reorder the codecs', async () => {
    // Stronger than a stale-number restart. Gzip does not merely scale the
    // figures — on the instance-heavy shape Share's batched writer produces
    // it inverts which codec is smallest (`codecSizes.js` module doc) — so a
    // sweep that carried its raw figures across this toggle would leave
    // `codecToSelect` reading the winner off the wrong set.
    const {result, rerender} = renderHook(
      ({isGzipped}) => useCodecSizes(ARTIFACT, {...BALANCED, isGzipped}),
      {initialProps: {isGzipped: false}})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))

    rerender({isGzipped: true})

    await waitFor(() => expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced', true))
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
    expect(artifactSizes).not.toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced', false)
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

  it('gives back the winner it was holding when the panel goes away', async () => {
    // The sweep keeps the winner so the selection that follows can use it —
    // but only for as long as there is a panel to select in. Reopening the
    // tab re-runs the whole axis from scratch, so a cell held past unmount is
    // never read again: it just sits on the artifact, which the store keeps
    // for the rest of the session, holding both metadata variants.
    const {result, unmount} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    releaseCompressedExport.mockClear()

    unmount()

    expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced')
  })

  it('drops the sweep\'s winner when the panel claims a cell of its own', async () => {
    // The panel's size line re-encodes for whatever codec is SELECTED, which
    // fills a cell the sweep does not track — so picking a codec the sweep
    // had already released left that cell on the artifact for the rest of the
    // session while the hook went on holding the winner beside it (#1852
    // review). One slot: the panel's claim displaces the sweep's.
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    releaseCompressedExport.mockClear()

    act(() => result.current.retainEstimate(ARTIFACT, 'meshopt', false, 'balanced'))

    expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced')
  })

  it('keeps the winner when the panel claims the very cell the sweep kept', async () => {
    // The auto-selection lands on the winner, and the size line then reads
    // the cell the sweep kept for exactly that. Releasing it on the way past
    // would re-create the bug two rounds of this review ago — a winner
    // measured and then thrown away, so selecting it re-encodes up to 50 MB
    // on the main thread.
    const {result} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    releaseCompressedExport.mockClear()

    act(() => result.current.retainEstimate(ARTIFACT, 'draco', false, 'balanced'))

    expect(releaseCompressedExport).not.toHaveBeenCalled()
  })

  it('gives back the panel\'s own cell when the panel goes away', async () => {
    // The same unmount contract as the winner above, for the other claimant:
    // the cell the size line last filled is nobody's once there is no panel
    // to display it in.
    const {result, unmount} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    act(() => result.current.retainEstimate(ARTIFACT, 'meshopt', false, 'balanced'))
    releaseCompressedExport.mockClear()

    unmount()

    expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, 'meshopt', false, 'balanced')
  })

  it('gives back the previous rung\'s winner when it restarts', async () => {
    // Same cell, the other way out: the teardown that runs on a rung change
    // hands back what the finished sweep was holding, because the new sweep
    // measures a different rung and so can never name the old cell itself.
    const {result, rerender} = renderHook(
      (props) => useCodecSizes(ARTIFACT, props),
      {initialProps: BALANCED},
    )
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))
    await waitFor(() => expect(result.current.isMeasuring).toBe(false))
    releaseCompressedExport.mockClear()

    rerender({...BALANCED, quality: 'best'})
    await waitFor(() => expect(result.current.sizesByCodec).toEqual(SIZES))

    expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced')
  })

  it('gives back a winner retained by a sweep that finished after it was superseded', async () => {
    // The gap the teardown cannot cover. Abort stops the NEXT codec, not the
    // one inside a synchronous wasm encode, so a rung change while the last
    // codec is running leaves that sweep to finish the whole axis — and a
    // sweep that finished keeps its winner. By then the teardown has already
    // run, so the dead sweep is the only thing left that knows the cell
    // exists: it hands it straight back rather than parking it in the slot
    // the live sweep owns.
    const pending = {}
    artifactSizes.mockImplementation((artifact, mode, isPortable, quality) =>
      new Promise((resolve) => {
        pending[`${mode}|${quality}`] = resolve
      }))
    const {rerender} = renderHook(
      ({quality}) => useCodecSizes(ARTIFACT, {...BALANCED, quality}),
      {initialProps: {quality: 'balanced'}},
    )

    await runDownToLastCodec(pending, 'balanced')

    rerender({quality: 'best'})
    releaseCompressedExport.mockClear()
    await act(async () => {
      pending['draco|balanced'](SIZES.draco)
      await Promise.resolve()
    })

    await waitFor(() => expect(releaseCompressedExport)
      .toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced'))
  })

  it('leaves the live sweep\'s winner alone when a superseded one finishes after it', async () => {
    // The other order, and the one the unguarded version got wrong. A sweep
    // that is already dead still runs its last codec to completion and still
    // reaches `onRetain`; writing to the shared slot there released whatever
    // the LIVE sweep had just retained — the cell the panel is about to
    // select — and left the dead sweep's own cell parked in its place. Two
    // faults from one line: a re-encode the user pays for on selection, and a
    // rung nobody is on pinned for the life of the artifact (#1852 review).
    const pending = {}
    artifactSizes.mockImplementation((artifact, mode, isPortable, quality) =>
      new Promise((resolve) => {
        pending[`${mode}|${quality}`] = resolve
      }))
    const {rerender} = renderHook(
      ({quality}) => useCodecSizes(ARTIFACT, {...BALANCED, quality}),
      {initialProps: {quality: 'balanced'}},
    )

    await runDownToLastCodec(pending, 'balanced')

    // The live sweep gets all the way home FIRST, so it is holding draco at
    // the rung the panel is actually on.
    rerender({quality: 'best'})
    for (const mode of ['none', 'meshopt', 'draco']) {
      await waitFor(() => expect(pending[`${mode}|best`]).toBeDefined())
      await act(async () => {
        pending[`${mode}|best`](SIZES[mode])
        await Promise.resolve()
      })
    }
    await waitFor(() => expect(releaseCompressedExport)
      .toHaveBeenCalledWith(ARTIFACT, 'meshopt', false, 'best'))
    releaseCompressedExport.mockClear()

    // …and only then does the superseded encode come back.
    await act(async () => {
      pending['draco|balanced'](SIZES.draco)
      await Promise.resolve()
    })
    await waitFor(() => expect(releaseCompressedExport)
      .toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced'))

    expect(releaseCompressedExport).not.toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'best')
  })

  it('installs nothing after the panel is gone, and frees what the dead sweep kept', async () => {
    // Unmount is the case with no next sweep to clean up after this one, so
    // an `onRetain` that parked its cell in the slot parked it forever: the
    // panel was gone, the teardown had already run, and both metadata
    // variants stayed on an artifact the store holds for the rest of the
    // session. Exactly the leak the round before this one was asked to fix
    // (#1852 review).
    const pending = {}
    artifactSizes.mockImplementation((artifact, mode, isPortable, quality) =>
      new Promise((resolve) => {
        pending[`${mode}|${quality}`] = resolve
      }))
    const {unmount} = renderHook(() => useCodecSizes(ARTIFACT, BALANCED))

    await runDownToLastCodec(pending, 'balanced')

    unmount()
    releaseCompressedExport.mockClear()
    await act(async () => {
      pending['draco|balanced'](SIZES.draco)
      await Promise.resolve()
    })

    await waitFor(() => expect(releaseCompressedExport)
      .toHaveBeenCalledWith(ARTIFACT, 'draco', false, 'balanced'))
    // Once, by the sweep itself — not installed in a slot that no longer has
    // an owner to empty it.
    expect(releaseCompressedExport.mock.calls
      .filter(([, mode]) => mode === 'draco')).toHaveLength(1)
  })
})


/**
 * Settle every codec but the last, leaving the sweep inside an encode an
 * abort cannot reach — the state all three supersession tests start from.
 *
 * @param {object} pending The deferred-resolution map, keyed `mode|quality`
 * @param {string} quality The rung this sweep is running at
 */
async function runDownToLastCodec(pending, quality) {
  for (const mode of ['none', 'meshopt']) {
    await waitFor(() => expect(pending[`${mode}|${quality}`]).toBeDefined())
    await act(async () => {
      pending[`${mode}|${quality}`](SIZES[mode])
      await Promise.resolve()
    })
  }
  await waitFor(() => expect(pending[`draco|${quality}`]).toBeDefined())
}
