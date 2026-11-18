/*
 * The hosted assistant's model allowlist (design/new/ai-workspace.md §6 D3,
 * §5 D2): which OpenRouter models the relay will route a tier to, and the
 * price it reserves against before each call.
 *
 * Server config, never a client constant (§6 "Free availability is
 * volatile… It is never a client constant"): the client names a model, the
 * relay checks it here and refuses anything else. A model leaving the deny
 * pool is a change to this file; the health-check canary (§6) that would
 * drop one automatically is a follow-up (#1932).
 *
 * Prices are USD per million tokens, input / output, and are used ONLY to
 * reserve a request's worst case before the call (`_lib/aiLedger.js`,
 * §7 "Reserve, then settle"). The charge itself is OpenRouter's
 * `usage.cost`. So a price here should be at or ABOVE what OpenRouter can
 * bill under `data_collection: "deny"`, which may route to a pricier
 * endpoint than the catalog's cheapest (§6 "A gap the live check found"):
 * over-reserving costs a user a refused request at the very end of a budget,
 * under-reserving costs Bldrs money past the budget.
 */


/** The default chain for anonymous and free: eval #1929's pick and its two fallbacks (§6). */
export const DEFAULT_MODEL = 'qwen/qwen3.7-flash'

/**
 * Paid models, by id. `fallbacks` is what the relay sends as OpenRouter's
 * `models` list when the client asks for that model, so the default chain
 * survives one provider leaving the deny pool (qwen and deepseek were each
 * single-provider in the eval, §6 "Single-provider risk").
 */
export const PAID_MODELS = Object.freeze({
  // $0.03 / $0.13 per M (live check 2026-10-06). One endpoint (Alibaba).
  [DEFAULT_MODEL]: {input: 0.03, output: 0.13, tiers: ['anonymous', 'free', 'pro'],
    fallbacks: ['deepseek/deepseek-v4-flash', 'openai/gpt-oss-120b']},
  // Not recorded in the live check. The eval measured $0.00058 a turn at
  // ~6.7k in / 0.5k out, which fits about $0.06 / $0.36; reserved at 5x that
  // until a deny-routed price is read off a real call (#1932).
  'deepseek/deepseek-v4-flash': {input: 0.30, output: 1.80, tiers: ['anonymous', 'free', 'pro']},
  // 23 endpoints from $0.03 / $0.17 to $0.35 / $0.75; deny may route to the
  // dearest (§6), so that is what is reserved.
  'openai/gpt-oss-120b': {input: 0.35, output: 0.75, tiers: ['anonymous', 'free', 'pro']},
  // Pro: eval #1929's two Pro-row models at catalog price. The live, priced
  // picker from /api/v1/models replaces this list in #1934.
  'google/gemini-3.8-flash': {input: 0.75, output: 3.75, tiers: ['pro']},
  'anthropic/claude-haiku-4.5': {input: 1, output: 5, tiers: ['pro']},
})

/**
 * The curated free list (§6 "Free-models list (opt-in, curated)"), all of
 * them deny-compatible per eval #1929. The optional NVIDIA entry is NOT
 * listed: it needs `data_collection: "allow"`, which is the owner's open
 * question (§15 Q9), and listing it would also need §10's disclosure.
 * The first entry is what an overflow (or an opt-in with no model named)
 * routes to, the rest are its fallbacks.
 */
export const FREE_MODELS = Object.freeze([
  'apodex/apodex-1.1-mini:free',
  'dots-studio/dots-3-note-preview:free',
  'inclusionai/ling-3.0-flash-sante:free',
  'openrouter/free',
])

/** What a client sends to opt into the free path without naming one model. */
export const FREE_MODELS_ALIAS = 'bldrs/free'

// OpenRouter caps `models` (fallbacks after `model`). Kept at three, the
// size every chain here has.
const MAX_FALLBACKS = 3


/**
 * @param {string} model as the client sent it
 * @return {boolean} whether it is the free path
 */
export function isFreeModel(model) {
  return model === FREE_MODELS_ALIAS || FREE_MODELS.includes(model)
}


/**
 * Resolve the client's model choice against a tier.
 *
 * @param {string} model the client's `model` field
 * @param {string} tier one of AI_TIERS
 * @return {{ok: true, free: boolean, model: string, fallbacks: Array<string>,
 *   price: {input: number, output: number}} | {ok: false}} `price` is the
 *   chain's dearest, which is what a reservation must cover
 */
export function resolveModel(model, tier) {
  if (typeof model !== 'string') {
    return {ok: false}
  }
  if (isFreeModel(model)) {
    return freeRoute(model)
  }
  const entry = PAID_MODELS[model]
  if (!entry || !entry.tiers.includes(tier)) {
    return {ok: false}
  }
  const fallbacks = (entry.fallbacks || []).filter((id) => PAID_MODELS[id]?.tiers.includes(tier))
    .slice(0, MAX_FALLBACKS)
  const chain = [model, ...fallbacks].map((id) => PAID_MODELS[id])
  return {
    ok: true,
    free: false,
    model,
    fallbacks,
    price: {
      input: Math.max(...chain.map((m) => m.input)),
      output: Math.max(...chain.map((m) => m.output)),
    },
  }
}


/**
 * The free path for a free model, or for the overflow (`FREE_MODELS[0]`).
 *
 * @param {string} [model]
 * @return {{ok: true, free: true, model: string, fallbacks: Array<string>, price: {input: 0, output: 0}}}
 */
export function freeRoute(model = FREE_MODELS[0]) {
  const primary = model === FREE_MODELS_ALIAS ? FREE_MODELS[0] : model
  return {
    ok: true,
    free: true,
    model: primary,
    fallbacks: FREE_MODELS.filter((id) => id !== primary).slice(0, MAX_FALLBACKS),
    price: {input: 0, output: 0},
  }
}
