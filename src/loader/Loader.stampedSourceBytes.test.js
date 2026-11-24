/* eslint-disable no-magic-numbers */
// A GLB cache hit parses the cached artifact, not the source, so the only
// source size it has is the one the writer stamped into the artifact's
// scenes[0].extras (glbExport.js#BLDRS_SOURCE_BYTES_EXTRAS_KEY). The hit reads
// it from the JSON prefix the cache lookup already holds, before the parse,
// so the model line and stats_fileSize can report it.
import {BLDRS_SOURCE_BYTES_EXTRAS_KEY} from './glbExport'
import {serializeGlb} from './injectGlbExtensions'
import {stampedSourceBytes} from './Loader'


/**
 * @param {object} extras scenes[0].extras, or undefined for none
 * @return {Uint8Array} a GLB whose JSON carries them
 */
function glbWithExtras(extras) {
  const json = {asset: {version: '2.0'}, scenes: [extras === undefined ? {nodes: []} : {nodes: [], extras}]}
  return new Uint8Array(serializeGlb(json, null))
}


describe('Loader#stampedSourceBytes', () => {
  it('reads the source size the writer stamped', () => {
    expect(stampedSourceBytes([glbWithExtras({[BLDRS_SOURCE_BYTES_EXTRAS_KEY]: 5_879_866})])).toBe(5_879_866)
  })

  it('is null for an artifact written before the stamp existed', () => {
    expect(stampedSourceBytes([glbWithExtras({bldrsTitle: 'Momentum'})])).toBeNull()
    expect(stampedSourceBytes([glbWithExtras(undefined)])).toBeNull()
  })

  it.each([0, -1, 1.5, '5879866', null])('is null for a stamp of %p: the artifact is untrusted', (value) => {
    expect(stampedSourceBytes([glbWithExtras({[BLDRS_SOURCE_BYTES_EXTRAS_KEY]: value})])).toBeNull()
  })

  it('is null, not a throw, for bytes that are not a GLB', () => {
    expect(stampedSourceBytes([new Uint8Array([1, 2, 3, 4])])).toBeNull()
    expect(stampedSourceBytes([])).toBeNull()
  })
})
