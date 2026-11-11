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
 * says whether a cold load should save an index sidecar.
 */
export const ARMS = {
  windowedHandle: {
    label: 'windowed, sync handle (Chromium default)',
    features: [],
    expect: {open: 'windowed', store: 'syncHandle', sidecar: true},
  },
  windowedHeld: {
    label: 'windowed, Blob store holds file (Firefox/Safari default)',
    features: ['disableEngineSyncHandle'],
    expect: {open: 'windowed', store: 'blobHeld', sidecar: true},
  },
  buffered: {
    label: 'buffered (disableStreamOpen)',
    features: ['disableStreamOpen'],
    expect: {open: 'buffered', store: null, sidecar: false},
  },
  heldBuffer: {
    label: 'buffered over held bytes (prototype, Share#2139)',
    features: ['disableEngineSyncHandle', 'engineHeldBufferOpen'],
    expect: {open: 'buffered', store: null, sidecar: true},
  },
  noSidecar: {
    label: 'windowed, sync handle, no source hash (disableEngineSidecar)',
    features: ['disableEngineSidecar'],
    expect: {open: 'windowed', store: 'syncHandle', sidecar: false},
  },
}


/** The matrix's default arm order: interleaved per round, never blocked. */
export const DEFAULT_ARMS = ['windowedHandle', 'windowedHeld', 'buffered', 'heldBuffer', 'noSidecar']

/** Arms that also run the two reopen phases by default. */
export const DEFAULT_REOPEN_ARMS = ['windowedHandle', 'heldBuffer']
