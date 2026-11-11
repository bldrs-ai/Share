// The engine's source policy (Share#2139, Share#2092; engine-worker.md
// §"Source policy: buffer for the parse, window at rest"): per open, whether
// conway reads the model BUFFERED (the whole file in the worker for the
// parse and the geometry pump, released to windows at the spill) or
// WINDOWED (paged through a byte store from the start).
//
// One rule for IFC and STEP. The measurements
// (design/new/source-policy-measurements.md) found buffered never slower on
// either format: faster on every IFC from 2.3 MiB up, and on STEP within
// noise up to ~56 MiB and faster above. So `format` is taken and echoed but
// decides nothing; a format difference that has to come back belongs here,
// as data, with the measurement that says why.
//
// Pure and worker-safe: no DOM, no store, no flags read here. The caller
// (engineHandler.js#openModel) supplies what the open found, and the page
// supplies the device (spawnEngine.js#engineDeviceSnapshot).

/* eslint-disable no-magic-numbers */
const MIB = 1024 * 1024
/* eslint-enable no-magic-numbers */


/**
 * Buffered-source budget per GiB of `navigator.deviceMemory`: the cap under
 * which an open over an OPFS sync access handle reads the whole file.
 *
 * PROVISIONAL (Share#2139). Where it comes from: 128 MiB × 8 GiB = 1 GiB,
 * which buffers PSB (860.7 MiB, the largest model measured) on an 8 GiB
 * desktop; 4 GiB gives 512 MiB. Capped at BUFFERED_SOURCE_MAX_BYTES, since
 * `deviceMemory` buckets go above 8 (headless Chromium 153 on a 17 GB
 * machine reports 16). What it trades: the source stays in the worker until
 * the GLB writer's spill, through the writer's renderer peak; on PSB that
 * peak read 5.3 GB buffered against 5.6 GB windowed at the median (one
 * buffered round 6.4), source-policy-measurements.md §"Source policy as
 * built".
 */
// eslint-disable-next-line no-magic-numbers
export const BUFFERED_SOURCE_BYTES_PER_DEVICE_GIB = 128 * MIB

/**
 * The cap's ceiling, whatever the device: the largest file buffered in any
 * measurement (PSB, 860.7 MiB) fits, and so does the Blob store's own
 * whole-file ceiling (engineSources.js#RESIDENT_SOURCE_MAX_BYTES, the same
 * 1 GiB). A larger file has never been measured buffered, so it windows.
 */
// eslint-disable-next-line no-magic-numbers
export const BUFFERED_SOURCE_MAX_BYTES = 1024 * MIB

/**
 * Devices reporting this much memory or less get a cap no larger than
 * {@link SMALL_DEVICE_BUFFERED_SOURCE_MAX_BYTES}: no device this small has
 * been measured (every run was on a 17 GB container).
 */
export const SMALL_DEVICE_MEMORY_GIB = 4

/**
 * The cap's ceiling on a small device: 256 MiB, conway's windowed provider's
 * own adaptive residency ceiling (`ADAPTIVE_MAX_RESIDENT_BYTES`,
 * `src/step/step_buffer_provider.ts`, 256 MiB in conway 1.1645.781). So on
 * those devices a buffered open never holds more source than a windowed open
 * may come to hold anyway. Caps: 0.25 GiB → 32 MiB, 0.5 → 64, 1 → 128,
 * 2 → 256, 4 → 256, 8 and up → 1 GiB.
 */
// eslint-disable-next-line no-magic-numbers
export const SMALL_DEVICE_BUFFERED_SOURCE_MAX_BYTES = 256 * MIB

/** The cap where `navigator.deviceMemory` is absent, on a desktop. */
// eslint-disable-next-line no-magic-numbers
export const BUFFERED_SOURCE_CAP_DESKTOP_BYTES = 1024 * MIB

/**
 * The cap where `navigator.deviceMemory` is absent, on a phone (the repo's
 * form factor, `utils/constants.js#MOBILE_WIDTH`). A quarter of the
 * desktop's: phones are where a tab is killed for memory first, and no
 * phone has been measured.
 */
// eslint-disable-next-line no-magic-numbers
export const BUFFERED_SOURCE_CAP_PHONE_BYTES = 256 * MIB


/** The stores an open can find (engineSources.js#openSourceStore). */
export const StoreKind = Object.freeze({
  // A read-only OPFS sync access handle (Chromium's worker).
  SYNC_HANDLE: 'syncHandle',
  // The Blob store, holding the whole file for the load (Firefox, Safari,
  // the sync-handle kill switch, in process).
  BLOB_HELD: 'blobHeld',
  // The Blob store, reading windows from the Blob (the hold did not happen
  // or failed: over RESIDENT_SOURCE_MAX_BYTES, an allocation failure,
  // `disableEngineResidentSource`, a File not in OPFS).
  BLOB: 'blob',
})


/**
 * Why the policy chose what it chose. Codes, not text: they cross from the
 * worker in the `done` packet, name the load-report line
 * (engineModelLoad.js#sourceModeLine) and are the GA param, so they must
 * never carry a file name or a path.
 */
export const SourceModeReason = Object.freeze({
  // No windowed open is possible: a `{bytes}` source (not staged in OPFS),
  // or an engine without the store open. Not a choice.
  NO_STORE: 'noStore',
  // `?feature=disableStreamOpen`: the classic buffered open, no sidecar.
  STREAM_OPEN_DISABLED: 'disableStreamOpen',
  // `disableBufferedSource` is on: today's windowed behaviour.
  KILL_SWITCH: 'disableBufferedSource',
  // A persisted index sidecar was found: the reopen pages from the store.
  INDEX_REOPEN: 'indexReopen',
  // The Blob store already holds the whole file: buffered over those bytes.
  HELD_BY_BLOB_STORE: 'heldByBlobStore',
  // The Blob store does not hold the file: windowed over the Blob.
  BLOB_NOT_HELD: 'blobNotHeld',
  // Sync access handle, file within the cap.
  UNDER_CAP: 'underCap',
  // Sync access handle, file over the cap.
  OVER_CAP: 'overCap',
  // Set by the handler, not here: the policy chose buffered and it failed
  // for memory, so the open went windowed. Either the whole-file read could
  // not be allocated (`failure: 'RangeError'`, same engine: the engine was
  // never touched), or a buffered open on an earlier engine ran out of
  // memory and the page retried windowed on a fresh one
  // (`failure: 'outOfMemory'`, engineModelLoad.js#parse).
  BUFFERED_FAILED: 'bufferedFailed',
  // Set by the handler, not here: the policy chose windowed over a store and
  // conway's windowed open failed for some other reason than a schema
  // refusal, so openDeferred fell through to its buffered open of the whole
  // file (conwayOpen.js), over the cap too when it was over the cap.
  // Pre-dates the policy; engine-worker.md §5.6 names it as a follow-up.
  WINDOWED_FAILED: 'windowedFailed',
  // Set by the handler, not here: the policy chose windowed, conway refused
  // the store open as one it cannot do (STORE_NOT_SYNCHRONOUS: a STEP over a
  // store that cannot read synchronously, in process) and opened buffered
  // (conwayOpen.js#openDeferred).
  WINDOWED_REFUSED: 'windowedRefused',
})


/**
 * The reasons for which the policy CHOSE buffered over a store it could have
 * windowed over: the intended path, not a degraded one, so not counted as
 * `engine_source_buffered` (Loader.js#reportLoadDiagnostics).
 */
export const POLICY_BUFFERED_REASONS = Object.freeze([SourceModeReason.UNDER_CAP, SourceModeReason.HELD_BY_BLOB_STORE])


/**
 * The buffered cap for this device.
 *
 * @param {object} device
 * @param {number|null|undefined} device.deviceMemoryGiB `navigator.deviceMemory`
 * @param {boolean} device.isMobile the page's form factor
 * @return {number} bytes
 */
export function bufferedSourceCap({deviceMemoryGiB, isMobile}) {
  if (Number.isFinite(deviceMemoryGiB) && deviceMemoryGiB > 0) {
    const ceiling = deviceMemoryGiB <= SMALL_DEVICE_MEMORY_GIB ?
      SMALL_DEVICE_BUFFERED_SOURCE_MAX_BYTES : BUFFERED_SOURCE_MAX_BYTES
    return Math.min(Math.round(BUFFERED_SOURCE_BYTES_PER_DEVICE_GIB * deviceMemoryGiB), ceiling)
  }
  return isMobile ? BUFFERED_SOURCE_CAP_PHONE_BYTES : BUFFERED_SOURCE_CAP_DESKTOP_BYTES
}


/**
 * Buffered or windowed, for one open. Rules in order (engine-worker.md
 * §"Source policy"):
 *   0. no store: buffered, there being nothing to window over;
 *   1. kill switch (`disableBufferedSource`): windowed;
 *   2. index-only reopen (a sidecar was found): windowed;
 *   3. Blob store (no read-only sync access handle): buffered when it holds
 *      the whole file, else windowed;
 *   4. sync access handle: buffered within the device's cap, else windowed.
 *
 * @param {object} input
 * @param {number} input.bytes the source's size
 * @param {string|null} [input.format] 'ifc' | 'step', echoed only
 * @param {boolean} input.hasSidecar a persisted index sidecar was found
 * @param {string|null} input.storeKind a {@link StoreKind}, or null when
 *   the open has no store
 * @param {number|null} [input.deviceMemoryGiB]
 * @param {boolean} [input.isMobile]
 * @param {object} [input.flags] the engine flag snapshot
 *   (spawnEngine.js#engineFlagSnapshot)
 * @return {{mode: ('buffered'|'windowed'), reason: string, bytes: number,
 *   format: (string|null), storeKind: (string|null), capBytes: (number|undefined)}}
 *   the inputs that decided are echoed, for the load report and GA
 */
export function chooseSourceMode({
  bytes, format = null, hasSidecar, storeKind, deviceMemoryGiB = null, isMobile = false, flags = {},
}) {
  const decide = (mode, reason, extra = {}) => ({mode, reason, bytes, format, storeKind: storeKind ?? null, ...extra})
  if (storeKind === null || storeKind === undefined) {
    return decide('buffered',
      flags.disableStreamOpen ? SourceModeReason.STREAM_OPEN_DISABLED : SourceModeReason.NO_STORE)
  }
  if (flags.disableBufferedSource) {
    return decide('windowed', SourceModeReason.KILL_SWITCH)
  }
  if (hasSidecar) {
    return decide('windowed', SourceModeReason.INDEX_REOPEN)
  }
  if (storeKind === StoreKind.BLOB_HELD) {
    // The store already paid for the whole file, and windowing over it was
    // the highest-memory arm with no time benefit (measurements doc).
    return decide('buffered', SourceModeReason.HELD_BY_BLOB_STORE)
  }
  if (storeKind === StoreKind.BLOB) {
    return decide('windowed', SourceModeReason.BLOB_NOT_HELD)
  }
  const capBytes = bufferedSourceCap({deviceMemoryGiB, isMobile})
  return bytes <= capBytes ?
    decide('buffered', SourceModeReason.UNDER_CAP, {capBytes}) :
    decide('windowed', SourceModeReason.OVER_CAP, {capBytes})
}
