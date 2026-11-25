// The size bucket the load diagnostics send to GA, so a raw byte count
// can't fingerprint a file. Cut from loader/reportLoadDiagnostics.js, which
// re-exports it (design/tracks/open-t200/layering.md §7 M1).

/* eslint-disable no-magic-numbers */
const MIB = 1024 * 1024
const GIB = 1024 * MIB
const TEN_MIB = 10 * MIB
const HUNDRED_MIB = 100 * MIB
/* eslint-enable no-magic-numbers */


/**
 * @param {number} sizeBytes the source's size
 * @return {string} '<10MB' | '10-100MB' | '100MB-1GB' | '>=1GB'; '>=1GB'
 *   edges are inclusive below (exactly 10 MiB is '10-100MB')
 */
export function sizeClass(sizeBytes) {
  if (sizeBytes < TEN_MIB) {
    return '<10MB'
  }
  if (sizeBytes < HUNDRED_MIB) {
    return '10-100MB'
  }
  return sizeBytes < GIB ? '100MB-1GB' : '>=1GB'
}
