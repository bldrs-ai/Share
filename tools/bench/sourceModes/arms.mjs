/**
 * The source-mode arms (README.md §"Arms"). Each arm is a set of
 * `?feature=` flags, a short label for tables, and the open kind the arm is
 * named for, which `lib.mjs#checkArm` compares against what the load report
 * says the engine actually did. That check is the point of `expect`: a flag
 * that silently stops applying (renamed, a fallback taken, a format the
 * path doesn't cover) would otherwise produce a plausible column of numbers
 * for the wrong arm.
 *
 * `expect.open` is `windowed` or `buffered`; `expect.store` is the store the
 * windowed arms page through (`syncHandle`, or `blobHeld` for the Blob store
 * holding the whole file), or null where the open reads none; `expect.sidecar`
 * says whether a cold load should save an index sidecar; `expect.sourceMode`
 * is the mode the load report's `Engine source:` line must name (the source
 * policy's decision, src/engine/engineModelLoad.js#sourceModeLine).
 */
export const ARMS = {
  // The source policy's default (src/engine/sourcePolicy.js, Share#2139):
  // on Chromium the sync access handle is read whole into one buffer and
  // the open is buffered, under the device's cap.
  policyDefault: {
    label: 'source policy default (buffered over the sync handle under the cap)',
    features: [],
    expect: {open: 'buffered', store: null, sidecar: true, sourceMode: 'buffered'},
  },
  // The arms below force the paths the policy replaced, by its kill switch
  // (`disableBufferedSource`): each reproduces what its name says as it ran
  // before the policy, so its numbers compare with the earlier records.
  windowedHandle: {
    label: 'windowed, sync handle (disableBufferedSource; Chromium before the policy)',
    features: ['disableBufferedSource'],
    expect: {open: 'windowed', store: 'syncHandle', sidecar: true, sourceMode: 'windowed'},
  },
  windowedHeld: {
    label: 'windowed, Blob store holds file (disableBufferedSource; Firefox/Safari before the policy)',
    features: ['disableEngineSyncHandle', 'disableBufferedSource'],
    expect: {open: 'windowed', store: 'blobHeld', sidecar: true, sourceMode: 'windowed'},
  },
  buffered: {
    label: 'buffered (disableStreamOpen)',
    features: ['disableStreamOpen'],
    expect: {open: 'buffered', store: null, sidecar: false, sourceMode: 'buffered'},
  },
  // Was the prototype `engineHeldBufferOpen` (Share#2139); now the policy's
  // default on the Blob store (Firefox, Safari), forced here in Chromium.
  heldBuffer: {
    label: 'buffered over held bytes (the policy on the Blob store)',
    features: ['disableEngineSyncHandle'],
    expect: {open: 'buffered', store: null, sidecar: true, sourceMode: 'buffered'},
  },
  noSidecar: {
    label: 'windowed, sync handle, no source hash (disableEngineSidecar, disableBufferedSource)',
    features: ['disableEngineSidecar', 'disableBufferedSource'],
    expect: {open: 'windowed', store: 'syncHandle', sidecar: false, sourceMode: 'windowed'},
  },
}


/** The matrix's default arm order: interleaved per round, never blocked. */
export const DEFAULT_ARMS = ['policyDefault', 'windowedHandle', 'windowedHeld', 'buffered', 'heldBuffer', 'noSidecar']

/** Arms that also run the two reopen phases by default. */
export const DEFAULT_REOPEN_ARMS = ['policyDefault', 'windowedHandle', 'heldBuffer']
