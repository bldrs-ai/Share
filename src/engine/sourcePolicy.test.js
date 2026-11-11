/* eslint-disable no-magic-numbers */
import {
  BUFFERED_SOURCE_BYTES_PER_DEVICE_GIB, BUFFERED_SOURCE_CAP_DESKTOP_BYTES, BUFFERED_SOURCE_CAP_PHONE_BYTES,
  SourceModeReason, StoreKind, bufferedSourceCap, chooseSourceMode,
} from './sourcePolicy'


const MIB = 1024 * 1024


/**
 * @param {object} [overrides]
 * @return {object} a policy input for an 8 GiB Chromium desktop over the sync handle
 */
function input(overrides = {}) {
  return {
    bytes: 100 * MIB, format: 'ifc', hasSidecar: false, storeKind: StoreKind.SYNC_HANDLE,
    deviceMemoryGiB: 8, isMobile: false, flags: {}, ...overrides,
  }
}


describe('engine/sourcePolicy#bufferedSourceCap', () => {
  it('is 128 MiB per GiB of deviceMemory where the browser reports it', () => {
    expect(BUFFERED_SOURCE_BYTES_PER_DEVICE_GIB).toBe(128 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: 8, isMobile: false})).toBe(1024 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: 4, isMobile: false})).toBe(512 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: 0.5, isMobile: true})).toBe(64 * MIB)
  })

  it('without deviceMemory: 1 GiB on a desktop, 256 MiB on a phone', () => {
    expect(BUFFERED_SOURCE_CAP_DESKTOP_BYTES).toBe(1024 * MIB)
    expect(BUFFERED_SOURCE_CAP_PHONE_BYTES).toBe(256 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: null, isMobile: false})).toBe(1024 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: undefined, isMobile: true})).toBe(256 * MIB)
    // A nonsense reading is treated as absent, not as a zero cap.
    expect(bufferedSourceCap({deviceMemoryGiB: 0, isMobile: false})).toBe(1024 * MIB)
    expect(bufferedSourceCap({deviceMemoryGiB: NaN, isMobile: true})).toBe(256 * MIB)
  })
})


describe('engine/sourcePolicy#chooseSourceMode', () => {
  it('rule 4: over the sync handle, buffered within the cap and windowed above it', () => {
    expect(chooseSourceMode(input({bytes: 1024 * MIB})))
      .toEqual({mode: 'buffered', reason: SourceModeReason.UNDER_CAP, bytes: 1024 * MIB, format: 'ifc',
        storeKind: StoreKind.SYNC_HANDLE, capBytes: 1024 * MIB})
    expect(chooseSourceMode(input({bytes: (1024 * MIB) + 1})))
      .toMatchObject({mode: 'windowed', reason: SourceModeReason.OVER_CAP, capBytes: 1024 * MIB})
    // PSB (860.7 MiB) buffers on an 8 GiB desktop and windows on a 4 GiB one.
    const psb = Math.round(860.7 * MIB)
    expect(chooseSourceMode(input({bytes: psb})).mode).toBe('buffered')
    expect(chooseSourceMode(input({bytes: psb, deviceMemoryGiB: 4})).mode).toBe('windowed')
    // A phone without deviceMemory: 256 MiB.
    expect(chooseSourceMode(input({bytes: 300 * MIB, deviceMemoryGiB: null, isMobile: true})))
      .toMatchObject({mode: 'windowed', capBytes: 256 * MIB})
    expect(chooseSourceMode(input({bytes: 300 * MIB, deviceMemoryGiB: null, isMobile: false})))
      .toMatchObject({mode: 'buffered', capBytes: 1024 * MIB})
  })

  it('rule 3: over the Blob store, buffered when it holds the file, windowed when it does not', () => {
    // Size does not enter: the store already paid for the whole file.
    expect(chooseSourceMode(input({storeKind: StoreKind.BLOB_HELD, bytes: 2000 * MIB, deviceMemoryGiB: 1})))
      .toEqual({mode: 'buffered', reason: SourceModeReason.HELD_BY_BLOB_STORE, bytes: 2000 * MIB, format: 'ifc',
        storeKind: StoreKind.BLOB_HELD})
    expect(chooseSourceMode(input({storeKind: StoreKind.BLOB, bytes: 1 * MIB})))
      .toMatchObject({mode: 'windowed', reason: SourceModeReason.BLOB_NOT_HELD})
  })

  it('rule 2: a sidecar reopen is windowed, whatever the store or size', () => {
    for (const storeKind of [StoreKind.SYNC_HANDLE, StoreKind.BLOB_HELD, StoreKind.BLOB]) {
      expect(chooseSourceMode(input({storeKind, hasSidecar: true, bytes: 1 * MIB})))
        .toMatchObject({mode: 'windowed', reason: SourceModeReason.INDEX_REOPEN})
    }
  })

  it('rule 1: the kill switch windows every open that has a store, before any other rule', () => {
    const flags = {disableBufferedSource: true}
    expect(chooseSourceMode(input({flags, bytes: 1 * MIB})))
      .toMatchObject({mode: 'windowed', reason: SourceModeReason.KILL_SWITCH})
    expect(chooseSourceMode(input({flags, storeKind: StoreKind.BLOB_HELD})))
      .toMatchObject({mode: 'windowed', reason: SourceModeReason.KILL_SWITCH})
    expect(chooseSourceMode(input({flags, hasSidecar: true})))
      .toMatchObject({mode: 'windowed', reason: SourceModeReason.KILL_SWITCH})
  })

  it('with no store there is nothing to window: buffered, saying why', () => {
    expect(chooseSourceMode(input({storeKind: null})))
      .toMatchObject({mode: 'buffered', reason: SourceModeReason.NO_STORE})
    // The kill switch cannot window what has no store.
    expect(chooseSourceMode(input({storeKind: null, flags: {disableBufferedSource: true}})))
      .toMatchObject({mode: 'buffered', reason: SourceModeReason.NO_STORE})
    // Rule 5: `disableStreamOpen` keeps its meaning (the classic buffered open).
    expect(chooseSourceMode(input({storeKind: null, flags: {disableStreamOpen: true}})))
      .toMatchObject({mode: 'buffered', reason: SourceModeReason.STREAM_OPEN_DISABLED})
  })

  it('IFC and STEP get the same decision', () => {
    for (const overrides of [{}, {bytes: 2048 * MIB}, {storeKind: StoreKind.BLOB_HELD}, {hasSidecar: true}]) {
      const {format: ifcFormat, ...ifc} = chooseSourceMode(input({...overrides, format: 'ifc'}))
      const {format: stepFormat, ...step} = chooseSourceMode(input({...overrides, format: 'step'}))
      expect([ifcFormat, stepFormat]).toEqual(['ifc', 'step'])
      expect(step).toEqual(ifc)
    }
  })
})
