/*
 * The Pro model picker's catalogue (design/new/ai-workspace.md §6 "Pro
 * picker", Share#1934): which OpenRouter models a Pro user may pick beyond
 * the curated `PAID_MODELS` (`aiModels.js`), and the ceiling price the relay
 * enforces and reserves at for a picked one.
 *
 * Two public OpenRouter reads build the list, cached per instance:
 *  - `GET /api/v1/models`: every model, with `supported_parameters`,
 *    modalities, `expiration_date` and its listed `pricing`;
 *  - `GET /api/v1/endpoints/zdr`: every Zero Data Retention endpoint.
 * A model is listed (catalogueEntry) when it takes `tools`, reads and writes
 * text only, hasn't expired, its listed pricing is one the reservation can
 * bound (pricingCeiling), and at least one of its tool-capable endpoints is
 * ZDR without Safety Retention.
 *
 * Why the ZDR list: neither `/models` nor `/models/{id}/endpoints` says which
 * endpoints survive `data_collection: "deny"` (§6 "A gap the live check
 * found"; still true on 2026-11-23). A ZDR endpoint keeps nothing after the
 * request, so it can't collect or train either: a model with one has an
 * endpoint deny routes to. It is a conservative proxy, not the deny pool
 * itself: deny also admits endpoints that keep prompts for a while without
 * training on them, so some deny-routable models are left out (qwen3.7-flash,
 * whose one Alibaba endpoint isn't ZDR, is one; the curated table keeps it).
 * Safety Retention endpoints are not counted: they keep prompts for abuse
 * review, and whether deny admits them isn't documented. The filter is about
 * what the picker offers, never about privacy: every request still goes out
 * with `data_collection: "deny"` (ai-chat.js upstreamRequest), so a listed
 * model with no deny endpoint after all answers 404 and is refused, it is
 * never sent to an endpoint that collects.
 *
 * The ceiling of a picked model is read from `GET /api/v1/models/{id}/endpoints`
 * at pick time, never from `/models`: `/models` lists one price, its
 * endpoints can be dearer (gemini-3.8-flash's priority tier is 1.8x it), and
 * the bound must hold on whichever endpoint OpenRouter routes to. Same rule
 * as the curated table: the dearest of all its endpoints, long-context tiers
 * (`pricing.overrides`) included, and reasoning priced at its own rate when
 * dearer than output. A model whose ceiling can't be determined is refused.
 *
 * Plain Node ESM with no dependencies, like the rest of `_lib/ai*`. `fetch`
 * is passed in per call: no client is built at module scope
 * (netlify-functions-testing.md §"Adding a function"). The caches are plain
 * data at module scope, so a warm instance answers from them.
 */
import {PAID_MODELS} from './aiModels.js'


export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const OPENROUTER_ZDR_URL = 'https://openrouter.ai/api/v1/endpoints/zdr'

/**
 * @param {string} id an id that passed isCatalogueId
 * @return {string} its endpoints URL; each path segment encoded, the slash kept
 */
export function endpointsUrl(id) {
  return `https://openrouter.ai/api/v1/models/${id.split('/').map(encodeURIComponent).join('/')}/endpoints`
}

const MILLIS_PER_MINUTE = 60000
const CATALOGUE_TTL_MINUTES = 10
const FAILURE_TTL_MINUTES = 1
/** How long a warm instance trusts a catalogue or ceiling it read. */
export const CATALOGUE_TTL_MS = CATALOGUE_TTL_MINUTES * MILLIS_PER_MINUTE
/** A failed read is retried no sooner than this, so an outage isn't a fetch per turn. */
export const FAILURE_TTL_MS = FAILURE_TTL_MINUTES * MILLIS_PER_MINUTE
const CEILING_CACHE_MAX = 200
const FETCH_TIMEOUT_MS = 10000

/**
 * An id the picker can carry: `vendor/model`, no variant suffix. `:free`
 * ids are the free path's (`aiModels.js`), `:batch` and the others aren't
 * chat models a stream can use, and `~` aliases and `openrouter/*` are
 * routers whose model (and price) is chosen per request.
 */
const CATALOGUE_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i
const ROUTER_VENDOR = 'openrouter/'
// Longer than any real id; it only keeps a caller's string out of a URL.
const MAX_ID_LENGTH = 128

/**
 * @param {*} id
 * @return {boolean} whether it has the shape of a model the catalogue may list
 */
export function isCatalogueId(id) {
  return typeof id === 'string' && id.length <= MAX_ID_LENGTH && CATALOGUE_ID.test(id) && !id.startsWith(ROUTER_VENDOR)
}


// `pricing` fields, USD per token as decimal strings. The bound
// (ai-chat.js reservationMicro) covers input and output tokens; these are
// left out of it, each for a reason the relay enforces:
//  - cache reads are cheaper than input, and cache writes need
//    `cache_control`, which the relay strips (ai-chat.js TOOL_CHOICES audit);
//  - image, audio: the relay forwards text only (textOf refuses the rest);
//  - web search: plugins, `web_search_options` and server tools are
//    stripped, so nothing asks for one;
//  - `discount` only lowers a price.
// Any OTHER field with a non-zero value (a per-request fee, image or audio
// output) is a charge the bound doesn't cover, so the price is undeterminable.
const UNBILLED_FIELDS = new Set(['input_cache_read', 'input_cache_write', 'input_cache_write_1h', 'image', 'audio',
  'input_audio_cache', 'web_search', 'discount'])
const BILLED_FIELDS = new Set(['prompt', 'completion', 'internal_reasoning'])
const PER_MILLION = 1e6
// Prices print as decimal strings ("0.00000075"); scaling one to per-million
// lands a float a hair off (0.7499999999999999). 12 significant digits is
// past any listed price's precision and well inside the 1.1 margin.
const PRICE_PRECISION = 12


/**
 * @param {*} value a `pricing` field
 * @return {?number} USD per million tokens, or null when it isn't a non-negative number
 */
function perMillion(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (typeof value === 'number' ? value : NaN)
  if (!Number.isFinite(n) || n < 0) {
    return null
  }
  return Number((n * PER_MILLION).toPrecision(PRICE_PRECISION))
}


/**
 * One pricing object (an endpoint's, a long-context override, or a model's
 * listed one) as the most an input and an output token can cost on it.
 *
 * @param {*} pricing
 * @param {boolean} [isOverride] an override inherits what it doesn't name,
 *   and carries its threshold (`min_prompt_tokens`)
 * @return {?{input: ?number, output: ?number}} USD per million tokens; null
 *   when a field is malformed or bills something the bound doesn't cover
 */
function priceOf(pricing, isOverride = false) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    return null
  }
  for (const [field, value] of Object.entries(pricing)) {
    if (BILLED_FIELDS.has(field) || UNBILLED_FIELDS.has(field) || field === 'overrides' ||
        (isOverride && /^(min|max)_/.test(field))) {
      continue
    }
    if (perMillion(value) !== 0) {
      return null
    }
  }
  const input = pricing.prompt === undefined && isOverride ? null : perMillion(pricing.prompt)
  const completion = pricing.completion === undefined && isOverride ? null : perMillion(pricing.completion)
  if (!isOverride && (input === null || completion === null)) {
    return null
  }
  if ((pricing.prompt !== undefined && input === null) || (pricing.completion !== undefined && completion === null)) {
    return null
  }
  let output = completion
  if (pricing.internal_reasoning !== undefined) {
    const reasoning = perMillion(pricing.internal_reasoning)
    if (reasoning === null) {
      return null
    }
    output = Math.max(output ?? 0, reasoning)
  }
  return {input, output}
}


/**
 * The most a token can cost under one pricing object, its long-context
 * tiers included.
 *
 * @param {*} pricing an endpoint's `pricing`, or a model's listed one
 * @return {?{input: number, output: number}} USD per million tokens, or null
 *   when it can't be bounded
 */
export function pricingCeiling(pricing) {
  const base = priceOf(pricing)
  if (!base) {
    return null
  }
  let {input, output} = base
  const overrides = pricing.overrides ?? []
  if (!Array.isArray(overrides)) {
    return null
  }
  for (const override of overrides) {
    const tier = priceOf(override, true)
    if (!tier) {
      return null
    }
    input = Math.max(input, tier.input ?? 0)
    output = Math.max(output, tier.output ?? 0)
  }
  return {input, output}
}


/**
 * A model's ceiling: the dearest of ALL its endpoints. All, not only the
 * tool-capable or ZDR ones: `require_parameters` constrains routing only when
 * the request carries tools, and deny admits more than ZDR, so any endpoint
 * may be the one billed.
 *
 * @param {*} endpoints `data.endpoints` of `/models/{id}/endpoints`
 * @return {?{input: number, output: number}} USD per million tokens, or null
 *   when there are none or any one can't be bounded (OpenRouter could route
 *   to that one)
 */
export function ceilingFromEndpoints(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return null
  }
  let input = 0
  let output = 0
  for (const endpoint of endpoints) {
    const price = pricingCeiling(endpoint?.pricing)
    if (!price) {
      return null
    }
    input = Math.max(input, price.input)
    output = Math.max(output, price.output)
  }
  // Both zero is a free model under another name: it would skip the free
  // path's request count (aiLedger freeRequestsPerDay). Not a paid route.
  return input > 0 || output > 0 ? {input, output} : null
}


/**
 * @param {*} zdr `/endpoints/zdr`'s JSON
 * @return {?Set<string>} the model ids with a tool-capable ZDR endpoint that
 *   doesn't use Safety Retention, or null when the shape isn't the expected one
 */
export function zdrToolModels(zdr) {
  if (!zdr || !Array.isArray(zdr.data)) {
    return null
  }
  const ids = new Set()
  for (const endpoint of zdr.data) {
    if (endpoint && typeof endpoint.model_id === 'string' && endpoint.safety_retention !== true &&
        Array.isArray(endpoint.supported_parameters) && endpoint.supported_parameters.includes('tools')) {
      ids.add(endpoint.model_id)
    }
  }
  return ids
}


/**
 * One `/models` entry as the picker lists it, or null when it isn't
 * offered (the filter in the header comment).
 *
 * @param {*} model one entry of `/models` `data`
 * @param {Set<string>} zdrIds zdrToolModels'
 * @param {number} nowMs
 * @return {?{id: string, name: string, price: {input: number, output: number}}}
 *   `price` is OpenRouter's LISTED price, for display; what the relay
 *   enforces is the endpoints' ceiling (resolveCatalogueModel)
 */
export function catalogueEntry(model, zdrIds, nowMs) {
  if (!model || !isCatalogueId(model.id) || !zdrIds.has(model.id)) {
    return null
  }
  if (!Array.isArray(model.supported_parameters) || !model.supported_parameters.includes('tools')) {
    return null
  }
  const inputs = model.architecture?.input_modalities
  const outputs = model.architecture?.output_modalities
  if (!Array.isArray(inputs) || !inputs.includes('text') || !Array.isArray(outputs) || outputs.length !== 1 ||
      outputs[0] !== 'text') {
    return null
  }
  if (model.expiration_date) {
    const expires = Date.parse(model.expiration_date)
    if (!Number.isFinite(expires) || expires <= nowMs) {
      return null
    }
  }
  const price = pricingCeiling(model.pricing)
  if (!price || (price.input === 0 && price.output === 0)) {
    return null
  }
  return {id: model.id, name: typeof model.name === 'string' && model.name ? model.name : model.id, price}
}


/**
 * @param {*} models `/models`'s JSON
 * @param {*} zdr `/endpoints/zdr`'s JSON
 * @param {number} nowMs
 * @return {?Array<object>} the listed models, by name; null when either
 *   answer isn't the expected shape
 */
export function filterCatalogue(models, zdr, nowMs) {
  const zdrIds = zdrToolModels(zdr)
  if (!zdrIds || !models || !Array.isArray(models.data)) {
    return null
  }
  const entries = []
  for (const model of models.data) {
    const entry = catalogueEntry(model, zdrIds, nowMs)
    if (entry) {
      entries.push(entry)
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
}


/**
 * The listed name and price of some ids, whatever the filter says: the
 * curated models are offered on their own terms (`aiModels.js`), but the
 * picker shows them with OpenRouter's name and listed price like the rest.
 *
 * @param {object} models `/models`'s JSON, already checked to have `data`
 * @param {Array<string>} ids
 * @return {Map<string, {name: string, price: object}>}
 */
function listedModels(models, ids) {
  const wanted = new Set(ids)
  const out = new Map()
  for (const model of models.data) {
    const price = model && wanted.has(model.id) ? pricingCeiling(model.pricing) : null
    if (price) {
      out.set(model.id, {name: typeof model.name === 'string' && model.name ? model.name : model.id, price})
    }
  }
  return out
}


/**
 * What the picker gets (ai-chat.js `GET ?catalogue`): the curated models
 * first, each with the tiers it serves, then the catalogue's, Pro only.
 * Without a catalogue (OpenRouter unreachable) the curated table alone, at
 * its ceiling prices, so the picker still offers the default chain and the
 * two Pro models.
 *
 * @param {object} catalogue loadCatalogue's answer
 * @return {{source: string, models: Array<object>}} `source` 'live' or 'static'
 */
export function pickerModels(catalogue) {
  const curated = Object.entries(PAID_MODELS).map(([id, entry]) => {
    const listed = catalogue.ok ? catalogue.listed.get(id) : undefined
    return {id, name: listed?.name ?? entry.name, price: listed?.price ?? {input: entry.input, output: entry.output},
      tiers: [...entry.tiers]}
  })
  if (!catalogue.ok) {
    return {source: 'static', models: curated}
  }
  const picked = catalogue.models.filter((entry) => !(entry.id in PAID_MODELS))
    .map((entry) => ({...entry, tiers: ['pro']}))
  return {source: 'live', models: [...curated, ...picked]}
}


// Per instance. `catalogue`: {value, until} where value is
// {ok: true, models, byId} or a failure {ok: false, reason}. `ceilings`:
// id → {value, until}, value {ok: true, price} or a failure.
let catalogueCache = null
const ceilingCache = new Map()


/** For tests: forget what this instance read, as a cold start would. */
export function resetCatalogueCache() {
  catalogueCache = null
  ceilingCache.clear()
}


/**
 * GET a public OpenRouter JSON document. No key is sent: these are public,
 * and the relay's key stays on the one request that needs it.
 *
 * @param {Function} fetchImpl
 * @param {string} url
 * @return {Promise<object>} `{ok: true, json}` or `{ok: false, reason: 'unreachable'|'status'|'malformed', status?}`
 */
async function getJson(fetchImpl, url) {
  let res
  try {
    res = await fetchImpl(url, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)})
  } catch {
    return {ok: false, reason: 'unreachable'}
  }
  if (!res.ok) {
    await res.text().catch(() => '')
    return {ok: false, reason: 'status', status: res.status}
  }
  try {
    return {ok: true, json: await res.json()}
  } catch {
    return {ok: false, reason: 'malformed'}
  }
}


/**
 * The filtered catalogue, from this instance's cache when fresh.
 *
 * @param {object} deps
 * @param {Function} deps.fetchImpl `fetch`, at request time
 * @param {number} deps.nowMs
 * @return {Promise<object>} `{ok: true, models, byId, listed}`, or `{ok: false, reason, status?}`
 */
export async function loadCatalogue({fetchImpl, nowMs}) {
  if (catalogueCache && nowMs < catalogueCache.until) {
    return catalogueCache.value
  }
  const models = await getJson(fetchImpl, OPENROUTER_MODELS_URL)
  let value
  if (!models.ok) {
    value = models
  } else {
    const zdrAnswer = await getJson(fetchImpl, OPENROUTER_ZDR_URL)
    if (!zdrAnswer.ok) {
      value = zdrAnswer
    } else {
      const entries = filterCatalogue(models.json, zdrAnswer.json, nowMs)
      value = entries ?
        {ok: true, models: entries, byId: new Map(entries.map((entry) => [entry.id, entry])),
          listed: listedModels(models.json, Object.keys(PAID_MODELS))} :
        {ok: false, reason: 'malformed'}
    }
  }
  catalogueCache = {value, until: nowMs + (value.ok ? CATALOGUE_TTL_MS : FAILURE_TTL_MS)}
  return value
}


/**
 * A model's ceiling from its endpoints, from this instance's cache when fresh.
 *
 * @param {string} id
 * @param {object} deps
 * @param {Function} deps.fetchImpl
 * @param {number} deps.nowMs
 * @return {Promise<object>} `{ok: true, price}`, or `{ok: false, reason}`
 *   ('unreachable' | 'status' | 'malformed' | 'unpriced')
 */
export async function loadCeiling(id, {fetchImpl, nowMs}) {
  const cached = ceilingCache.get(id)
  if (cached && nowMs < cached.until) {
    return cached.value
  }
  const answer = await getJson(fetchImpl, endpointsUrl(id))
  let value
  if (!answer.ok) {
    value = answer
  } else if (!answer.json?.data || answer.json.data.id !== id || !Array.isArray(answer.json.data.endpoints)) {
    value = {ok: false, reason: 'malformed'}
  } else {
    const price = ceilingFromEndpoints(answer.json.data.endpoints)
    value = price ? {ok: true, price} : {ok: false, reason: 'unpriced'}
  }
  if (ceilingCache.size >= CEILING_CACHE_MAX) {
    ceilingCache.delete(ceilingCache.keys().next().value)
  }
  // An unpriced model is cached as long as a priced one: it is the
  // catalogue's answer, not an outage.
  const ttl = value.ok || value.reason === 'unpriced' ? CATALOGUE_TTL_MS : FAILURE_TTL_MS
  ceilingCache.set(id, {value, until: nowMs + ttl})
  return value
}


/**
 * Resolve a model the curated table doesn't list against the catalogue.
 * Pro only: any other tier is refused before anything is fetched.
 *
 * Why the bound holds for a picked model: the relay sends `price` as
 * `provider.max_price`, so OpenRouter routes only to an endpoint at or under
 * it, and reserves at the same `price` (ai-chat.js reservationMicro). A
 * cached ceiling that has since gone stale can't break that: an endpoint
 * that raised its price past it is skipped, not billed, and if every one
 * did, the request is refused upstream (404) and its hold released.
 *
 * @param {string} model the client's
 * @param {string} tier
 * @param {object} deps loadCatalogue's
 * @return {Promise<object>} a route as `aiModels.js resolveModel` returns one,
 *   plus `source: 'catalogue'` and no fallbacks (the user picked this model;
 *   a reply from another would be a surprise); or `{ok: false, code, reason}`,
 *   `code` an ai-chat ERRORS key: `ai_model_not_allowed` for a model this
 *   tier can't use or the catalogue doesn't offer or price, and
 *   `ai_model_unavailable` when OpenRouter couldn't be read
 */
export async function resolveCatalogueModel(model, tier, deps) {
  if (tier !== 'pro') {
    return {ok: false, code: 'ai_model_not_allowed', reason: 'tier'}
  }
  if (!isCatalogueId(model)) {
    return {ok: false, code: 'ai_model_not_allowed', reason: 'not_listed'}
  }
  const catalogue = await loadCatalogue(deps)
  if (!catalogue.ok) {
    return {ok: false, code: 'ai_model_unavailable', reason: `catalogue_${catalogue.reason}`,
      ...(catalogue.status ? {status: catalogue.status} : {})}
  }
  if (!catalogue.byId.has(model)) {
    return {ok: false, code: 'ai_model_not_allowed', reason: 'not_listed'}
  }
  const ceiling = await loadCeiling(model, deps)
  if (!ceiling.ok) {
    return ceiling.reason === 'unpriced' ?
      {ok: false, code: 'ai_model_not_allowed', reason: 'unpriced'} :
      {ok: false, code: 'ai_model_unavailable', reason: `endpoints_${ceiling.reason}`,
        ...(ceiling.status ? {status: ceiling.status} : {})}
  }
  return {ok: true, free: false, model, fallbacks: [], price: ceiling.price, source: 'catalogue'}
}
