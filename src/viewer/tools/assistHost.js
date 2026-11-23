import {OPENROUTER_KEY_ID, ToolError, createRegistry} from '../../assist'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {AI_TIERS, aiCreditLimits} from '../../quota/aiCredits'
import {shareAssistInstructions} from './assistInstructions'
import {ASSIST_MODEL} from './assistModels'
import {createShareToolProvider} from './shareTools'
import {createViewContextSource} from './viewContext'
import {createModelToolProvider, createViewToolProvider} from './viewTools'


/**
 * Share as an Assist host (ai-workspace.md §2.1, D15): Share imports Assist
 * and injects its tool providers and context sources. This is the one place
 * they are assembled, so the dev hook below and the agent loop
 * ({@link createShareAssist}) see the same registry.
 *
 * @return {object} the Assist registry over Share's providers
 */
export function createShareAssistRegistry() {
  return createRegistry(
    [createModelToolProvider(), createViewToolProvider(), createShareToolProvider()],
    {contextSources: [createViewContextSource()]})
}


// The default model, and the free-models alias (assistModels.js).
export {ASSIST_FREE_MODELS, ASSIST_MODEL} from './assistModels'


/** Bldrs' hosted assistant relay (netlify/functions/ai-chat.js), same origin. */
export const AI_RELAY_URL = '/.netlify/functions/ai-chat'


/**
 * The agent loop over Share's registry (#1675), on one of two transports
 * chosen afresh each turn (ai-workspace.md D1): the user's own OpenRouter key
 * from `keyStore` when they have given one (BYOK, browser → OpenRouter), and
 * otherwise Bldrs' hosted relay within their plan's credits (#1932). Share's
 * instructions, and the conversation kept in `conversationStore`. `runtime`
 * is the lazy module (viewer/tools/assistRuntime.js), passed in so this module
 * never imports the AI SDK.
 *
 * @param {object} runtime `src/assist/runtime.ts`, loaded
 * @param {object} deps
 * @param {object} deps.keyStore an Assist KeyStore
 * @param {object} deps.conversationStore an Assist ConversationStore
 * @param {object} deps.hosted the hosted transport's host side: `getAuthToken`,
 *   `anonTokens` and `onMeta`, as `HostedTransportOptions` names them, and
 *   optionally `model`, read at each turn (the model picker, #1934); without
 *   one the hosted transport asks for ASSIST_MODEL. The BYOK transport always
 *   uses ASSIST_MODEL: the picker is for Bldrs' hosted models
 * @return {{assist: object, transport: object, dispose: Function}}
 */
export function createShareAssist(runtime, {keyStore, conversationStore, hosted}) {
  const base = process.env.OPENROUTER_BASE_URL
  assertDefined(base, 'OPENROUTER_BASE_URL is required')
  assertDefined(hosted, 'the hosted transport\'s host side is required')
  const registry = createShareAssistRegistry()
  const byok = runtime.openRouterTransport({
    getKey: () => keyStore.get(OPENROUTER_KEY_ID),
    model: ASSIST_MODEL,
    baseURL: `${base}/api/v1`,
    appUrl: 'https://bldrs.ai',
    appTitle: 'Bldrs Share',
  })
  const relay = runtime.hostedTransport({relayUrl: AI_RELAY_URL, maxRequestBytesFor, ...hosted,
    model: hosted.model ?? ASSIST_MODEL})
  const transport = runtime.selectTransport(() => (keyStore.get(OPENROUTER_KEY_ID) ? byok : relay))
  const assist = runtime.createAssist({
    transport,
    registry,
    store: conversationStore,
    instructions: shareAssistInstructions(),
  })
  return {assist, transport, dispose: () => registry.dispose()}
}


/**
 * The request body cap to assume for a tier until the relay says its own
 * (`x-bldrs-ai-max-body-bytes`, which carries any env override), so the loop
 * keeps each step under it (assist/loop.ts `boundStepMessages`). Signed out
 * and free have one (quota/aiCredits.js `maxBodyBytes*`, ai-chat.js
 * `maxBodyBytesFor`); Pro has only the relay's technical cap. With no tier
 * (before the first response, or after a sign-in change) the smallest default
 * holds: a request that fits it fits every tier at its defaults.
 *
 * @param {?string} tier the relay's, or null before it has said
 * @return {number|undefined} bytes, or undefined for no cap
 */
export function maxRequestBytesFor(tier) {
  if (tier === AI_TIERS.PRO) {
    return undefined
  }
  const {maxBodyBytes} = aiCreditLimits({})
  return tier === AI_TIERS.FREE ? maxBodyBytes[AI_TIERS.FREE] :
    Math.min(maxBodyBytes[AI_TIERS.ANONYMOUS], maxBodyBytes[AI_TIERS.FREE])
}


/**
 * Install `window.__bldrsAssistTools`, for Playwright and the console to
 * drive the tools before there's a tray to drive them from. CadView installs
 * it only under `?feature=assist`.
 *
 *   list()             tool descriptors (name, description, schema, policy)
 *   call(name, input)  → {ok: true, content, echo, refs, undoable}
 *                      | {ok: false, error: {code, message, details}}
 *   undo()             reverses the most recent undoable call; → true, or
 *                      false with nothing to undo; rejects if the undo failed
 *   context()          context blocks
 *
 * Results cross `page.evaluate` as plain data, which is why `undo` is a
 * stack here instead of the function each result carries. The stack is
 * emptied whenever the store's viewer or model changes: CadView (and so
 * this hook) stays mounted while the route loads another model or a theme
 * change rebuilds the viewer, and an entry for the old one has nothing left
 * to restore (Codex review on #1946; each undo also
 * refuses on its own — viewTools.js `undoWhileLoaded`). Tools whose policy
 * is 'confirm' are refused: this hook has no approval card, and none of the
 * v0 tools needs one.
 *
 * @param {object} [target] where to install (the window)
 * @return {Function} uninstall
 */
export function installAssistDevHook(target = window) {
  const registry = createShareAssistRegistry()
  const undos = []
  const unsubscribe = useStore.subscribe((state, previous) => {
    // A new viewer is stored before its model loads (viewTools.js
    // `undoWhileLoaded` has the sequence), so either change ends the stack.
    if (state.model !== previous.model || state.viewer !== previous.viewer) {
      undos.length = 0
    }
  })
  const failure = (e) => ({
    ok: false,
    error: e instanceof ToolError ? e.toJSON() : {code: 'error', message: String(e?.message ?? e), details: {}},
  })
  target.__bldrsAssistTools = {
    list: () => registry.list(),
    call: async (name, input) => {
      try {
        if (registry.has(name) && registry.policyOf(name) === 'confirm') {
          throw new ToolError('rejected', `'${name}' needs approval, which the dev hook can't give.`)
        }
        const result = await registry.call(name, input)
        if (result.undo) {
          undos.push(result.undo)
        }
        return {ok: true, content: result.content, echo: result.echo ?? null, refs: result.refs ?? [],
          undoable: Boolean(result.undo)}
      } catch (e) {
        return failure(e)
      }
    },
    undo: async () => {
      const undo = undos.pop()
      if (!undo) {
        return false
      }
      await undo()
      return true
    },
    context: () => registry.context(),
  }
  return () => {
    delete target.__bldrsAssistTools
    unsubscribe()
    registry.dispose()
  }
}
