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
 * Prices are USD per million tokens, input / output: OpenRouter's LISTED
 * prices, read from `GET /api/v1/models/{id}/endpoints` on 2026-11-18, and for
 * each model the dearest of all its endpoints, long-context tiers included
 * (qwen3.7-flash bills 0.20 / 0.80 past 256k prompt tokens). They do two jobs:
 *  - the relay sends the route's ceiling as `provider.max_price`, so
 *    OpenRouter won't route to an endpoint dearer than it (one that raises
 *    its price is skipped, not paid);
 *  - the reservation is priced at that same ceiling (ai-chat.js
 *    `reservationMicro`), so it bounds what the request can cost.
 * The charge itself is still OpenRouter's `usage.cost`; a settle above the
 * reservation is booked in full and reported (`settle_exceeded_reservation`).
 * A model with no listed price is not routed to at all.
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
  // One endpoint (Alibaba): 0.03 / 0.13, 0.10 / 0.40 from 32k prompt tokens,
  // 0.20 / 0.80 from 256k. The ceiling is the last tier.
  [DEFAULT_MODEL]: {input: 0.20, output: 0.80, tiers: ['anonymous', 'free', 'pro'],
    fallbacks: ['deepseek/deepseek-v4-flash', 'openai/gpt-oss-120b']},
  // 15 endpoints, 0.04 / 0.10 to 0.21 / 0.56 (Azure).
  'deepseek/deepseek-v4-flash': {input: 0.21, output: 0.56, tiers: ['anonymous', 'free', 'pro']},
  // 24 endpoints, 0.03 / 0.15 to 0.35 (Cerebras) / 0.95 (SambaNova).
  'openai/gpt-oss-120b': {input: 0.35, output: 0.95, tiers: ['anonymous', 'free', 'pro']},
  // Pro: eval #1929's two Pro-row models. The live, priced picker from
  // /api/v1/models replaces this list in #1934.
  // 6 endpoints, 0.375 / 1.875 to 1.35 / 6.75 (reasoning billed at output).
  'google/gemini-3.8-flash': {input: 1.35, output: 6.75, tiers: ['pro']},
  // 4 endpoints, all 1 / 5.
  'anthropic/claude-haiku-4.5': {input: 1, output: 5, tiers: ['pro']},
})

/**
 * The curated free list (§6 "Free-models list (opt-in, curated)"), all of
 * them deny-compatible per eval #1929. The optional NVIDIA entry is NOT
 * listed: it needs `data_collection: "allow"`, which is the owner's open
 * question (§15 Q9), and listing it would also need §10's disclosure.
 * `apodex/apodex-1.1-mini:free` and `inclusionai/ling-3.0-flash-sante:free`
 * were on the eval's list but are gone from the live catalog (2026-11-18), so
 * they are not routed to. The first entry is what an overflow (or an opt-in
 * with no model named) routes to; the rest are its fallbacks. The free path
 * is sent with `max_price` 0, so it can't be billed.
 */
export const FREE_MODELS = Object.freeze([
  'dots-studio/dots-3-note-preview:free',
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
 * @return {object} `{ok: true, free, model, fallbacks, price: {input, output}}`, where
 *   `price` is the chain's dearest listed price (USD per million tokens),
 *   which the relay both enforces as `max_price` and reserves at; or
 *   `{ok: false}`
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
 * @return {object} `{ok: true, free: true, model, fallbacks, price: {input: 0, output: 0}}`
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
