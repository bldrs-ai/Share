import {modelFileInPath} from '../../Containers/SelectionHashWriter'
import {HASH_PREFIX_SELECTION} from '../../Containers/selectionHash'
import useStore from '../../store/useStore'
import {setParamsToHash} from '../../utils/location'
import {parseRef} from '../visibilityRefs'
import {refMaker, resolveRefs} from './refs'
import {selectAndFrame} from './viewTools'


/**
 * Element mentions in an assistant reply (#1673, assist-310; design/new/
 * conversational-cad.md §4). The model writes `[Wall 3](ref:e123)` with a
 * ref exactly as a tool returned it; the client turns that into a chip that
 * jumps to the element, and into a real Share permalink for "Copy link".
 *
 * The `ref:` scheme, rather than a URL the model writes out, is so that the
 * model never composes a permalink (it can't know this deployment's origin
 * or the model's route, and a fabricated one would look just as plausible as
 * a good one). A ref that no tool returned simply fails to resolve here and
 * the chip says so.
 */


/** The scheme of an element mention's link target. */
export const REF_SCHEME = 'ref:'

// IFC's compressed GUID, with the `g` prefix the tools return it with
// (refs.js accepts the bare form too, but a mention carries the prefixed one).
const GLOBAL_ID_REF = /^g[0-9A-Za-z_$]{22}$/


/**
 * @param {string} uri a link target
 * @return {string|null} the ref it carries when it is `ref:<ref>` with a
 *   well-formed ref (`e`, `o`, `n` or `g`), else null. Well-formed is
 *   syntax only; whether the loaded model has it is {@link describeRef}'s.
 */
export function refOfLinkUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(REF_SCHEME)) {
    return null
  }
  const ref = uri.substring(REF_SCHEME.length)
  return GLOBAL_ID_REF.test(ref) || parseRef(ref) !== null ? ref : null
}


// A Markdown inline link on one line; its target is inspected below.
const INLINE_LINK = /\[([^\]\n]+)\]\(([^()\n]*)\)/g


/**
 * Repair the one malformed mention models produce: several refs in one link,
 * `[Küchenzeile](ref:e546633, ref:e546662)` (owner testing on SEESTRASSE).
 * A Markdown link target can't hold a space, so that renders as text and
 * shows the raw refs. It becomes one link per ref with the same label,
 * `[Küchenzeile](ref:e546633), [Küchenzeile](ref:e546662)`. Only a target
 * made entirely of refs (each `ref:x` or a bare `x` after the first),
 * separated by commas or spaces, is rewritten; every other link is left as
 * written, and each ref is still validated by {@link refOfLinkUri} at render.
 *
 * @param {string} markdown
 * @return {string}
 */
export function splitMultiRefLinks(markdown) {
  if (typeof markdown !== 'string' || !markdown.includes(REF_SCHEME)) {
    return markdown
  }
  return markdown.replace(INLINE_LINK, (link, label, target) => {
    const parts = target.trim().split(/[\s,]+/).filter(Boolean)
    if (parts.length < 2 || !parts[0].startsWith(REF_SCHEME)) {
      return link
    }
    const refs = parts.map((part) => (part.startsWith(REF_SCHEME) ? part.substring(REF_SCHEME.length) : part))
    if (refs.some((ref) => ref === '' || ref.includes(':'))) {
      return link
    }
    return refs.map((ref) => `[${label}](${REF_SCHEME}${ref})`).join(', ')
  })
}


/**
 * Resolve a mention against the model that is open now.
 *
 * @param {string} ref
 * @param {object} [location] window.location, for the permalink's origin and model path
 * @return {{ok: true, permalink: string}|{ok: false, reason: string}} the
 *   permalink opens Share on this model with the element selected
 *   (`#sel:` for an element or scene-graph node, the element path for a
 *   STEP occurrence, as selecting it would write); `reason` is for a tooltip
 */
export function describeRef(ref, location = window.location) {
  const state = useStore.getState()
  const {viewer, model, rootElement, searchIndex, isModelReady} = state
  // `isModelReady` is raised only once CadView has finished the isolator's
  // `setModel`, which a scene-graph model's name paths (`n` refs) wait on; the
  // store's model and tree are set earlier, so they alone would resolve too soon.
  if (!isModelReady || !viewer?.isolator || !model || !rootElement) {
    return {ok: false, reason: 'Open the model this reply is about to jump to this element.'}
  }
  const {targets} = resolveRefs([ref], {viewer, rootElement, searchIndex})
  if (targets.length === 0) {
    return {ok: false, reason: 'This element isn\'t in the model that is open.'}
  }
  const target = targets[0]
  const base = `${location.origin}${modelFileInPath(location.pathname) ?? location.pathname}`
  if (target.kind === 'occurrence') {
    // An `o` ref's ids are the element path below the root, as the URL writes it.
    return {ok: true, permalink: `${base}/${rootElement.expressID}/${parseRef(ref).ids.join('/')}`}
  }
  // Re-derived from the resolved id, so a `g<GlobalId>` mention (or a bare
  // one) links as the canonical `e`/`n` ref the selection token reads.
  const canonical = refMaker(viewer)(target.id)
  const hash = setParamsToHash('', HASH_PREFIX_SELECTION, {0: canonical})
  return {ok: true, permalink: `${base}${hash}`}
}


/**
 * A chip's click: select the element and frame it, as `view.select` then
 * `view.focus` do, so the highlight, NavTree, Properties and the live view
 * link follow with no reload.
 *
 * @param {string} ref
 */
export function jumpToRef(ref) {
  selectAndFrame([ref])
}
