/**
 * The model ids Share asks the hosted relay for (ai-workspace.md §6 D3).
 * Kept apart from assistHost.js, which builds the assistant, so the relay's
 * tests can check these against its own table (netlify/functions/_lib/aiModels.js)
 * without loading the store.
 *
 * The relay decides what each tier may use and re-checks it on every request;
 * these are only what the client names.
 */


/**
 * The default: eval #1929's pick (ai-workspace.md D3, §6): reliable tool
 * calls, deny routing available, and about $0.00015 a turn. The hosted relay
 * accepts it on every tier and adds its own fallbacks (aiModels.js
 * `PAID_MODELS`). It is also the model a key of the user's own uses (BYOK):
 * the picker is for Bldrs' hosted models only.
 */
export const ASSIST_MODEL = 'qwen/qwen3.7-flash'

/** How the settings name the default (OpenRouter's name for it, without the vendor). */
export const DEFAULT_MODEL_LABEL = 'Qwen3.7 Flash'


/**
 * The free-models opt-in (#1934): the relay's alias for its curated `:free`
 * list (aiModels.js `FREE_MODELS_ALIAS`), on every tier, at no credits.
 */
export const ASSIST_FREE_MODELS = 'bldrs/free'
