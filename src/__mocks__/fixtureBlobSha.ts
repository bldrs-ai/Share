/**
 * The blob sha the GitHub mocks answer for a bldrs-ai/test-models fixture:
 * a fake 40-hex value, different per path.
 *
 * It was one constant for every fixture, and the OPFS cache can't tell two
 * files in one directory apart by that: the worker's lookup takes any file
 * in the directory whose name carries the etag (the blob sha;
 * OPFS.worker.js, the last-segment search), with no check on the file's own
 * name. Real blob shas are content hashes, so a match there is the same
 * bytes; one shared fake sha served box.ifc's bytes for cut-plane-pick.ifc
 * once both had been opened in one browser profile (open-205, #2021: the
 * first spec to open two fixtures from `ifc/misc/` in one context).
 *
 * @param path the fixture's path inside the repo, e.g. 'ifc/misc/box.ifc'
 * @return 40 lowercase hex chars
 */
export function fixtureBlobSha(path: string): string {
  // FNV-1a, 32 bits: deterministic and the same in the page (MSW) and in
  // Node (the specs' page.route fallback, tests/e2e/models.ts).
  /* eslint-disable no-magic-numbers */
  let hash = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `e2e${hash.toString(16).padStart(8, '0')}`.padEnd(40, '0')
  /* eslint-enable no-magic-numbers */
}
