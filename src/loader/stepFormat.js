// Deep import through conway's `./src/*` export map, the same route
// `loadProgress.js` takes to `core/progress_log`. Deliberately the detector
// itself and not a re-implementation — see the note on `isConwayIfcFormat`.
import ModelFormatDetector, {ModelFormatType} from '@bldrs-ai/conway/src/format_detection/model_format_detector'
import ParsingBuffer from '@bldrs-ai/conway/src/parsing/parsing_buffer'
import debug from '../utils/debug'


/**
 * The window conway's store-backed open sniffs the format in — its own
 * `STORE_DETECT_PREFIX_BYTES` (`compat/web-ifc/ifc_api_model_passthrough_
 * factory.js`). Reading exactly this much means our answer comes from the
 * same bytes conway's will.
 */
export const STORE_DETECT_PREFIX_BYTES = 65_536


/**
 * True when conway's `IfcApiModelPassthroughFactory.fromStore` will accept
 * these bytes — i.e. when its detector reads them as IFC rather than
 * AP214/AP203/AP242 or as no format at all.
 *
 * **This calls conway's detector rather than mirroring it, and that is the
 * whole point.** `fromStore` reserves the model handle BEFORE it sniffs and
 * is IFC-only, so a "yes" it then refuses burns handle 0 and pushes the
 * buffered retry onto handle 1 — misaddressing every Share call site that
 * passes the scene-level id 0, the GLB writer's spatial-tree and
 * element-properties captures among them (bldrs-ai/Share#1776). Only a
 * false-yes is expensive; a false-no costs one load's memory win.
 *
 * Share did briefly carry a regex mirror of `ModelFormatDetector.detect`
 * (#1780). Differential testing against the real detector found eleven
 * false-yes divergences in it, and they were not a matter of polish — the
 * detector's answer depends on conway's part-21 parser reaching `ENDSEC;` /
 * `DATA;` under byte-exact keyword matching with its own string-escape DFA
 * (`\S\` swallows the next byte, apostrophes included). A text scan cannot
 * agree with that except by becoming it. Handing conway the same prefix it
 * will read makes agreement exact by construction, so please do not
 * reintroduce a local reimplementation of this; see
 * `src/loader/stepFormat.test.js`, whose cases are all divergences the
 * mirror got wrong.
 *
 * @param {Uint8Array} prefix the file's first {@link STORE_DETECT_PREFIX_BYTES}
 * @return {boolean} true only when conway detects IFC
 */
export function isConwayIfcFormat(prefix) {
  try {
    return ModelFormatDetector.detect(new ParsingBuffer(prefix)) === ModelFormatType.IFC
  } catch (e) {
    // The detector walks unvalidated bytes; anything it throws on is a file
    // we would not want on the store path anyway. Buffering is the safe
    // outcome, so this never propagates.
    debug().warn('stepFormat#isConwayIfcFormat: detect threw; buffering:', e)
    return false
  }
}
