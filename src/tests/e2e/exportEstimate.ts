/**
 * What the Export tab's size line says its figure is FOR, and how a test
 * decides the line it is looking at is the one it asked for.
 *
 * Split out of `export.ts` so it can be unit-tested under Jest
 * (`exportEstimate.test.js`) — `export.ts` imports `@playwright/test`, which
 * brings Playwright's own `expect` along and breaks every `toEqual` in a
 * suite that loads it (same reason `networkGuard.ts` is its own module).
 *
 * The decision is worth pinning on its own because both ways of getting it
 * wrong have been shipped here. Keying on the BYTE COUNT stalls whenever two
 * selections weigh the same, which is not hypothetical: a codec whose encoder
 * fails falls back to the file as it is (#1842), and Portable is a documented
 * pass-through on a merged-layout artifact (`export/glbPortable.js`). Keying
 * on nothing but "a size line is showing" reads the PREVIOUS selection's
 * figure, which is still on screen for the render between the click and the
 * effect that re-reads — that one cost a real failure under four-worker
 * contention, with Draco reading the Meshopt figure.
 */


/**
 * The identity of one displayed figure: the estimate it came from — portable
 * × codec × quality, the axes `export/artifactSizes.js` caches on — plus the
 * metadata toggle, which picks between the two figures that one estimate
 * produces.
 *
 * `Open/ExportSection.jsx` builds the same string into `data-estimate-key`
 * and is the other end of the contract.
 *
 * Quality is in the DISPLAY key at every codec, including `none`, even though
 * the cache leaves it out where no encoder runs. The two keys answer
 * different questions: the cache's asks "is this the same file?", this one
 * asks "has the line caught up with the controls?" — and the controls carry a
 * rung whatever the codec is.
 *
 * @param mode 'none' | 'meshopt' | 'draco'
 * @param isPortable the Portable toggle
 * @param isMetadataIncluded the "Include Bldrs metadata" toggle
 * @param quality 'best' | 'balanced' | 'smallest' (#1848)
 * @return the value `data-estimate-key` carries for that selection
 */
export function estimateKey(
  mode: string,
  isPortable: boolean,
  isMetadataIncluded: boolean,
  quality: string,
): string {
  return `${isPortable ? 'portable' : 'native'}|${mode}` +
    `|${quality}|${isMetadataIncluded ? 'meta' : 'nometa'}`
}


/**
 * The settled figure, once the size line is the one for `expectedKey`.
 *
 * Null means "keep polling", and covers both the pending line (no size line
 * at all, so no key) and the stale one — the previous selection's figure,
 * which is excluded by its key regardless of what it weighs. Note what is
 * NOT required: that the pending state was ever observed. On a fixture this
 * small the encode can finish inside one render, so a wait that insisted on
 * seeing "Estimating…" would hang on the fast path.
 *
 * @param key the line's `data-estimate-key`, or null when no settled line is up
 * @param bytes the line's `data-bytes`
 * @param expectedKey `estimateKey` for the selection the caller just made
 * @return the byte count, or null while the line is not that one yet
 */
export function settledEstimateBytes(
  key: string | null,
  bytes: string | null,
  expectedKey: string,
): number | null {
  if (key !== expectedKey || bytes === null) {
    return null
  }
  return Number(bytes)
}
