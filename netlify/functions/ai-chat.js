/*
 * Netlify Function (v2, streaming): ai-chat
 * -----------------------------------------
 * The hosted assistant's relay (design/new/ai-workspace.md §5 D2; Share#1932,
 * credits #1933): the browser's agent loop sends an OpenRouter Chat
 * Completions request here with no key of its own, and this function
 * forwards it to OpenRouter with Bldrs' key, within the caller's credits.
 *
 *   POST /.netlify/functions/ai-chat
 *   Authorization: Bearer <Auth0 access token> | <anonymous token> | (none)
 *   Body: an OpenAI-shape chat completion request, `stream: true`
 *   → 200 text/event-stream, OpenRouter's SSE passed through byte for byte
 *   → 4xx/5xx {error: {code: 'ai_…', message}, tier}
 *
 * Per request, in order:
 *  1. Config: OPENROUTER_API_KEY and AI_TOKEN_SECRET, or 500 not configured.
 *     First, so the live smoke probe's strict mode sees a missing secret.
 *  2. Body: JSON within MAX_BODY_BYTES, `stream: true`, messages and tools
 *     within their caps (§5 step 3). The deployed smoke probe sends `{}` and
 *     gets 400 `ai_bad_request` here, before anything touches an upstream.
 *  3. Identity and tier (D5): an Auth0 Bearer → `free` or `pro` from
 *     app_metadata through the Management API (`src/quota/proStatus.js`, the
 *     one Pro definition); anything else is `anonymous`, under a relay-minted
 *     HMAC token (`_lib/aiToken.js`) plus a day-salted IP-hash bucket.
 *  4. Model: the tier's allowlist (`_lib/aiModels.js`), or 400. Only the
 *     fields in FORWARDED_FIELDS survive, so a caller can't set routing,
 *     plugins or fallbacks; the relay then sets `max_tokens` to the tier cap
 *     at most, `provider: {data_collection: 'deny', require_parameters:
 *     true}`, its own fallback chain, and a server-owned system preamble.
 *  5. Reserve (D4, `_lib/aiLedger.js`): the request's worst case against the
 *     identity's budget, the IP bucket (anonymous), and the tier's global
 *     daily breaker (anonymous, free). A tripped breaker overflows the
 *     request to the free models rather than refusing it (§6 path 3), with
 *     `x-bldrs-ai-overflow: free_models` so the tray can say so.
 *  6. Stream upstream SSE through, watching for the final `usage.cost`
 *     (`_lib/aiSse.js`), then settle every hold to it. A client that hangs
 *     up doesn't stop the read: the upstream bills the whole generation
 *     anyway (§5 Amendment 3), so the relay keeps reading to the usage chunk.
 *     A stream that ends without one settles at the reserved amount.
 *
 * Never logs a request or response body, a token, a user id or an IP: the
 * log line is outcome, tier, model, token counts, cost, and OpenRouter's
 * generation id (the key for a later reconciliation, §5 Amendment 3).
 *
 * Reported Conditions (Sentry warnings; each once per instance per UTC day):
 * a tripped breaker; OpenRouter refusing Bldrs' key (401/403) or its credits
 * (402); our chosen model answering 404 (no deny-compatible endpoint) or 5xx,
 * or OpenRouter unreachable; the ledger unavailable. An exhausted budget,
 * the concurrency cap and a busy free pool are expected and go to the user
 * only (the client sends `quota_limit_reached` to GA for the first).
 *
 * Built as a v2 function because only v2 can stream (§5 "Vehicle"); Netlify
 * bundles v2 functions with nft whatever netlify.toml says, and
 * tools/netlify/functionBundler.test.js replays every scenario against that
 * bundle. Clients are built inside the handler, never at module scope
 * (netlify-functions-testing.md §"Adding a function").
 */
import {createHash, randomUUID} from 'node:crypto'
import {getStore} from '@netlify/blobs'
import * as Sentry from '@sentry/serverless'
import {AI_TIERS, AI_WINDOW_DAYS, aiCreditLimits} from '../../src/quota/aiCredits.js'
import {isProSubscriptionStatus} from '../../src/quota/proStatus.js'
import {getUserAppMetadata, verifyAuth0Bearer} from './_lib/auth0.js'
import {LedgerUnavailableError, releaseAll, reserveAll, settleAll, utcDay} from './_lib/aiLedger.js'
import {DEFAULT_MODEL, freeRoute, resolveModel} from './_lib/aiModels.js'
import {createUsageWatcher} from './_lib/aiSse.js'
import {hashIp, looksLikeAnonToken, mintAnonToken, verifyAnonToken} from './_lib/aiToken.js'


export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const LEDGER_STORE = 'ai-ledger'

// Request caps (§5 step 3). Technical limits, not business ones: a body this
// size is far past any v0 conversation, and the Share registry has ~15 tools.
const KIB = 1024
const MAX_BODY_KIB = 512
export const MAX_BODY_BYTES = MAX_BODY_KIB * KIB
export const MAX_MESSAGES = 200
export const MAX_TOOLS = 64

/** Output cap per request, by tier: `max_tokens` is min(requested, this). Reasoning tokens count. */
export const MAX_OUTPUT_TOKENS = Object.freeze({
  [AI_TIERS.ANONYMOUS]: 2048,
  [AI_TIERS.FREE]: 4096,
  [AI_TIERS.PRO]: 8192,
})

// Input tokens estimated from the forwarded body's bytes, for the
// reservation only. JSON-heavy prompts run 3-4 bytes a token, so 3 over-
// estimates slightly, which is the safe side (the settle uses the real count).
const BYTES_PER_TOKEN_ESTIMATE = 3

// The whole stream, headers to last byte. Past it the read is cut and the
// hold settles at its reservation.
const MILLIS_PER_MINUTE = 60000
const UPSTREAM_TIMEOUT_MINUTES = 5
const UPSTREAM_TIMEOUT_MS = UPSTREAM_TIMEOUT_MINUTES * MILLIS_PER_MINUTE

// The fields a caller may set. Everything else is dropped (§5 step 3), so a
// caller can't route, add plugins, name its own fallbacks or turn off deny.
// `stream_options` and `parallel_tool_calls` are what the AI SDK's OpenRouter
// provider sends besides §5's list; both are harmless.
const FORWARDED_FIELDS = ['messages', 'tools', 'tool_choice', 'temperature', 'parallel_tool_calls']

/**
 * The server-owned system preamble (§5 "Addition the research suggests",
 * #1932): prepended to every hosted request so the endpoint is a poor
 * general-purpose LLM for anyone holding an anonymous token (OpenRouter ToS
 * §7 bans reselling model access), at near-zero cost.
 */
export const SERVER_PREAMBLE =
  'You are the assistant inside Bldrs Share, a viewer for building and CAD models. Help the user ' +
  'understand and navigate the model open in their viewer, using the tools you are given. If a request ' +
  'has nothing to do with their model or with Share, say briefly that you can only help with the model.'

const HTTP = Object.freeze({
  OK: 200, BAD_REQUEST: 400, PAYMENT_REQUIRED: 402, FORBIDDEN: 403, NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405, REQUEST_TIMEOUT: 408, PAYLOAD_TOO_LARGE: 413, UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429, INTERNAL_ERROR: 500, BAD_GATEWAY: 502, SERVICE_UNAVAILABLE: 503,
  UNAUTHORIZED: 401,
})

// What the client shows comes from the code (src/assist/assistError.ts); the
// message is for a developer reading the network tab.
const ERRORS = Object.freeze({
  ai_method_not_allowed: [HTTP.METHOD_NOT_ALLOWED, 'POST only'],
  ai_not_configured: [HTTP.INTERNAL_ERROR, 'The hosted assistant is not configured on this deploy'],
  ai_bad_request: [HTTP.BAD_REQUEST, 'Expected a streaming chat completion request within the relay\'s caps'],
  ai_model_not_allowed: [HTTP.BAD_REQUEST, 'That model is not available on this tier'],
  ai_credits_exhausted: [HTTP.PAYMENT_REQUIRED, 'This tier\'s assistant credits are used up for now'],
  ai_free_requests_exhausted: [HTTP.TOO_MANY_REQUESTS, 'Today\'s free-model requests are used up'],
  ai_too_many_requests: [HTTP.TOO_MANY_REQUESTS, 'Too many assistant requests in flight; wait for one to finish'],
  ai_busy: [HTTP.SERVICE_UNAVAILABLE, 'The free assistant is busy'],
  ai_request_rejected: [HTTP.BAD_REQUEST, 'The model refused the request; the conversation may be too long'],
  ai_model_unavailable: [HTTP.BAD_GATEWAY, 'The assistant model is unavailable'],
  ai_upstream_error: [HTTP.BAD_GATEWAY, 'The assistant provider failed'],
  ai_unavailable: [HTTP.SERVICE_UNAVAILABLE, 'The hosted assistant is unavailable'],
})


/**
 * @param {Request} req
 * @param {object} [context] Netlify's: `ip`, `waitUntil`
 * @return {Promise<Response>}
 */
export default async function handler(req, context = {}) {
  const reports = createReporter(context)
  const nowMs = Date.now()

  if (req.method !== 'POST') {
    return errorResponse('ai_method_not_allowed')
  }
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const tokenSecret = process.env.AI_TOKEN_SECRET
  if (!openRouterKey || !tokenSecret) {
    const missing = [!openRouterKey && 'OPENROUTER_API_KEY', !tokenSecret && 'AI_TOKEN_SECRET'].filter(Boolean)
    console.error(`ai-chat: not configured, missing ${missing.join(', ')}`)
    return errorResponse('ai_not_configured')
  }

  const body = await readRequestBody(req)
  if (!body) {
    return errorResponse('ai_bad_request')
  }

  const identity = await identify(req, context, tokenSecret, nowMs)
  if (identity.response) {
    return identity.response
  }
  const {tier} = identity
  const meta = {tier, token: identity.mintedToken}

  let route = resolveModel(body.model ?? DEFAULT_MODEL, tier)
  if (!route.ok) {
    return errorResponse('ai_model_not_allowed', meta)
  }

  let store
  try {
    store = getStore({name: LEDGER_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`ai-chat: not configured, ledger store: ${err.name}`)
    return errorResponse('ai_not_configured', meta)
  }

  const limits = aiCreditLimits(process.env)
  const maxTokens = cappedMaxTokens(body.max_tokens, tier)
  const holdId = randomUUID()
  let overflow = false
  let upstreamBody = upstreamRequest(body, route, maxTokens)
  let reserved = reservationMicro(upstreamBody, route, maxTokens)
  let buckets = bucketsFor(identity, limits, nowMs, route.free)
  let reservation
  try {
    reservation = await reserveAll(store, buckets, {id: holdId, micro: reserved, free: route.free, nowMs})
    if (!reservation.ok && reservation.bucket === 'breaker') {
      // §6 path 3 / §7 D5: past the tier's daily breaker, overflow to the
      // free models instead of refusing.
      reports.breakerTripped(tier, limits.breakersConfigured[tier])
      overflow = true
      route = freeRoute()
      upstreamBody = upstreamRequest(body, route, maxTokens)
      reserved = 0
      buckets = bucketsFor(identity, limits, nowMs, true)
      reservation = await reserveAll(store, buckets, {id: holdId, micro: 0, free: true, nowMs})
    }
  } catch (err) {
    if (!(err instanceof LedgerUnavailableError)) {
      throw err
    }
    await reports.report('ledger_unavailable', {reason: err.reason})
    return errorResponse('ai_unavailable', meta)
  }
  if (!reservation.ok) {
    return refusalResponse(reservation, meta)
  }
  const identityStanding = reservation.standing.identity
  Object.assign(meta, {used: identityStanding.used, limit: identityStanding.limit, overflow})

  let upstream
  try {
    upstream = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        // OpenRouter app attribution (§5 step 3).
        'HTTP-Referer': 'https://bldrs.ai',
        'X-OpenRouter-Title': 'Bldrs Share',
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    await releaseAll(store, buckets, {id: holdId, nowMs})
    await reports.report('upstream_unreachable', {model: route.model})
    logOutcome({outcome: 'upstream_unreachable', tier, model: route.model, overflow})
    return errorResponse('ai_upstream_error', meta)
  }

  if (!upstream.ok) {
    // OpenRouter doesn't bill a refused request, so the holds go back whole.
    await releaseAll(store, buckets, {id: holdId, nowMs})
    // Read (and drop) the error body so the connection is freed; never logged.
    await upstream.text().catch(() => '')
    const code = await upstreamFailure(upstream.status, route, reports)
    logOutcome({outcome: `upstream_${upstream.status}`, tier, model: route.model, overflow})
    return errorResponse(code, meta)
  }

  const stream = relayStream(upstream.body, {
    store, buckets, holdId, reserved, route, tier, overflow, context,
  })
  return new Response(stream, {status: HTTP.OK, headers: metaHeaders(meta, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
  })})
}


/**
 * Parse and check the request body (§5 step 3's caps).
 *
 * @param {Request} req
 * @return {Promise<object|null>} the body, or null when it isn't acceptable
 */
async function readRequestBody(req) {
  let text
  try {
    text = await req.text()
  } catch {
    return null
  }
  if (!text || Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return null
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.stream !== true) {
    return null
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return null
  }
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > MAX_TOOLS)) {
    return null
  }
  if (body.model !== undefined && typeof body.model !== 'string') {
    return null
  }
  return body
}


// Signed-in tier lookups, by a hash of the access token. Auth0's /userinfo is
// rate limited per user, and an agent turn is ~3 requests (eval #1929), so a
// warm instance re-checks a token at most once per TIER_CACHE_MS. A tier
// change (an upgrade) shows within that time. Module scope, so per instance.
const TIER_CACHE_MINUTES = 5
const TIER_CACHE_MS = TIER_CACHE_MINUTES * MILLIS_PER_MINUTE
const TIER_CACHE_MAX = 500
const tierCache = new Map()


/**
 * Who is calling, and on what tier.
 *
 * @param {Request} req
 * @param {object} context
 * @param {string} tokenSecret
 * @param {number} nowMs
 * @return {Promise<object>} `{tier, ledgerKey, ipHash?, mintedToken?}`, or `{response}` to return as-is
 */
async function identify(req, context, tokenSecret, nowMs) {
  const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer && !looksLikeAnonToken(bearer)) {
    const signedIn = await identifySignedIn(bearer, nowMs)
    if (signedIn) {
      return signedIn
    }
    // `null`: Auth0 isn't configured on this deploy (verifyAuth0Bearer's dev
    // bypass), so there is no one to be signed in as. Serve anonymous.
  }
  const verified = bearer ? verifyAnonToken(tokenSecret, bearer, nowMs) : {ok: false}
  let anonId
  let mintedToken
  if (verified.ok) {
    anonId = verified.anonId
  } else {
    // Missing, malformed, forged or expired: mint, don't refuse
    // (_lib/aiToken.js says why).
    const minted = mintAnonToken(tokenSecret, nowMs)
    anonId = minted.anonId
    mintedToken = minted.token
  }
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip')
  return {
    tier: AI_TIERS.ANONYMOUS,
    ledgerKey: `ai/anonymous/${anonId}`,
    ipHash: ip ? hashIp(tokenSecret, ip, utcDay(nowMs)) : null,
    mintedToken,
  }
}


/**
 * @param {string} bearer an Auth0 access token
 * @param {number} nowMs
 * @return {Promise<object|null>} identity, `{response}`, or null for the dev bypass
 */
async function identifySignedIn(bearer, nowMs) {
  const cacheKey = createHash('sha256').update(bearer).digest('hex')
  const cached = tierCache.get(cacheKey)
  if (cached && nowMs < cached.until) {
    return cached.identity
  }
  const auth = await verifyAuth0Bearer({headers: {authorization: `Bearer ${bearer}`}})
  if (!auth.ok) {
    return {response: new Response(auth.response.body, {status: auth.response.statusCode,
      headers: {'Content-Type': 'application/json'}})}
  }
  if (!auth.sub) {
    return null
  }
  let tier = AI_TIERS.FREE
  let lookedUp = true
  try {
    const appMetadata = await getUserAppMetadata(auth.sub)
    if (isProSubscriptionStatus(appMetadata.subscriptionStatus)) {
      tier = AI_TIERS.PRO
    }
  } catch (err) {
    // A degraded state, not a refusal: serve the free tier's budget for this
    // request rather than nothing, and don't cache it, so the next request
    // looks again. Only the step that failed is logged, never the user.
    lookedUp = false
    console.warn(`ai-chat: tier lookup failed (${err.code || err.name}); serving the free tier`)
  }
  const identity = {tier, ledgerKey: `ai/user/${encodeURIComponent(auth.sub)}`}
  if (lookedUp) {
    if (tierCache.size >= TIER_CACHE_MAX) {
      tierCache.delete(tierCache.keys().next().value)
    }
    tierCache.set(cacheKey, {identity, until: nowMs + TIER_CACHE_MS})
  }
  return identity
}


/**
 * The ledger buckets a request reserves against, cheapest-to-contend first.
 *
 * @param {object} identity
 * @param {object} limits aiCreditLimits(env)
 * @param {number} nowMs
 * @param {boolean} free whether this is the free-models path (no breaker: it costs $0)
 * @return {Array<object>} aiLedger Buckets
 */
function bucketsFor(identity, limits, nowMs, free) {
  const {tier} = identity
  const caps = {freeRequestsPerDay: limits.freeModelRequestsPerDay, concurrency: limits.concurrency}
  const buckets = [{name: 'identity', key: identity.ledgerKey, limit: limits.budgets[tier],
    windowDays: AI_WINDOW_DAYS[tier], ...caps}]
  if (identity.ipHash) {
    buckets.push({name: 'ip', key: `ai/ip/${identity.ipHash}`, limit: limits.ipBudget, windowDays: 1, ...caps})
  }
  if (!free && tier !== AI_TIERS.PRO) {
    buckets.push({name: 'breaker', key: `ai/breaker/${tier}/${utcDay(nowMs)}`, limit: limits.breakers[tier],
      windowDays: 1})
  }
  return buckets
}


/**
 * @param {*} requested the client's `max_tokens`
 * @param {string} tier
 * @return {number} the tier cap, or less if the client asked for less
 */
function cappedMaxTokens(requested, tier) {
  const cap = MAX_OUTPUT_TOKENS[tier]
  return Number.isInteger(requested) && requested > 0 ? Math.min(requested, cap) : cap
}


/**
 * The body OpenRouter gets: the caller's allowed fields, and the relay's own
 * routing, caps and preamble on top.
 *
 * @param {object} body the caller's
 * @param {object} route resolveModel's
 * @param {number} maxTokens
 * @return {object}
 */
function upstreamRequest(body, route, maxTokens) {
  const forwarded = {}
  for (const field of FORWARDED_FIELDS) {
    if (body[field] !== undefined) {
      forwarded[field] = body[field]
    }
  }
  return {
    ...forwarded,
    messages: [{role: 'system', content: SERVER_PREAMBLE}, ...body.messages],
    model: route.model,
    ...(route.fallbacks.length > 0 ? {models: [route.model, ...route.fallbacks]} : {}),
    max_tokens: maxTokens,
    stream: true,
    stream_options: {include_usage: true},
    // OpenRouter's default is "allow": providers that store and may train
    // on the conversation (§5). `require_parameters` makes `tools` a hard
    // routing requirement rather than a preference. Every listed model,
    // free ones included, keeps deny (`_lib/aiModels.js`).
    provider: {data_collection: 'deny', require_parameters: true},
  }
}


/**
 * The worst case this request can cost, in micro-USD. A price per million
 * tokens in USD is exactly micro-USD per token.
 *
 * @param {object} upstreamBody
 * @param {object} route
 * @param {number} maxTokens
 * @return {number}
 */
function reservationMicro(upstreamBody, route, maxTokens) {
  if (route.free) {
    return 0
  }
  const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify(upstreamBody)) / BYTES_PER_TOKEN_ESTIMATE)
  return Math.ceil((inputTokens * route.price.input) + (maxTokens * route.price.output))
}


/**
 * Pass the upstream SSE through, and settle once it has ended. The client's
 * stream is closed only AFTER the settle, so the function is still running
 * (Netlify keeps a streaming function alive until its body closes) when the
 * ledger is written. A client that disconnects first stops receiving but not
 * the read: the upstream bills the whole generation anyway (§5 Amendment 3),
 * and `context.waitUntil` keeps the function alive for the rest of it where
 * the platform offers that.
 *
 * @param {ReadableStream} upstreamBody
 * @param {object} deps
 * @return {ReadableStream}
 */
function relayStream(upstreamBody, {store, buckets, holdId, reserved, route, tier, overflow, context}) {
  const watcher = createUsageWatcher()
  let attached = true
  let controller
  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
    cancel() {
      attached = false
    },
  })
  const forward = (fn) => {
    if (!attached) {
      return
    }
    try {
      fn()
    } catch {
      attached = false
    }
  }
  const enqueue = (bytes) => forward(() => controller.enqueue(bytes))
  const pump = (async () => {
    let readError = null
    try {
      const reader = upstreamBody.getReader()
      for (;;) {
        const {done, value} = await reader.read()
        if (done) {
          break
        }
        watcher.push(value)
        enqueue(value)
      }
      watcher.end()
    } catch (err) {
      readError = err
    }
    const seen = watcher.result()
    // No usage chunk (a cut stream, an upstream error mid-way): the upstream
    // may still bill, so settle at the reservation, never at zero.
    const micro = seen.micro ?? reserved
    const failures = await settleAll(store, buckets, {id: holdId, micro, nowMs: Date.now()})
    logOutcome({
      outcome: readError ? 'stream_cut' : (seen.micro === null ? 'no_usage' : 'ok'),
      tier, model: seen.model || route.model, overflow, micro, reserved,
      promptTokens: seen.promptTokens, completionTokens: seen.completionTokens,
      generation: seen.generationId, detached: !attached, settleFailures: failures.length,
    })
    if (readError) {
      forward(() => controller.error(readError))
    } else {
      forward(() => controller.close())
    }
  })()
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(pump)
  }
  return stream
}


/**
 * Map a refused upstream answer to the client's code, reporting the ones
 * someone at Bldrs has to fix.
 *
 * @param {number} status
 * @param {object} route
 * @param {object} reports
 * @return {Promise<string>} an ERRORS code
 */
async function upstreamFailure(status, route, reports) {
  if (status === HTTP.BAD_REQUEST || status === HTTP.PAYLOAD_TOO_LARGE || status === HTTP.UNPROCESSABLE) {
    return 'ai_request_rejected'
  }
  if (status === HTTP.UNAUTHORIZED || status === HTTP.FORBIDDEN) {
    await reports.report('upstream_key_refused', {status})
    return 'ai_unavailable'
  }
  if (status === HTTP.PAYMENT_REQUIRED) {
    // Bldrs' OpenRouter balance or key limit, never the user's credits
    // (§6 "OpenRouter-side guards").
    await reports.report('upstream_credits', {status})
    return 'ai_unavailable'
  }
  if (status === HTTP.TOO_MANY_REQUESTS || status === HTTP.REQUEST_TIMEOUT) {
    // The free pool is per account and shared (§6), so a 429 there is the
    // pool, expected under load; on the paid path it is upstream pressure.
    return route.free ? 'ai_busy' : 'ai_too_many_requests'
  }
  if (status === HTTP.NOT_FOUND) {
    // No endpoint for our model under deny, or the model is gone: ours to fix.
    await reports.report('model_unavailable', {status, model: route.model})
    return 'ai_model_unavailable'
  }
  await reports.report('upstream_error', {status, model: route.model})
  return 'ai_upstream_error'
}


/**
 * @param {object} reservation reserveAll's refusal
 * @param {object} meta
 * @return {Response}
 */
function refusalResponse(reservation, meta) {
  const withStanding = {...meta, ...(reservation.standing.identity || {})}
  if (reservation.reason === 'concurrency') {
    return errorResponse('ai_too_many_requests', withStanding)
  }
  if (reservation.reason === 'free_requests') {
    return errorResponse('ai_free_requests_exhausted', withStanding)
  }
  return errorResponse('ai_credits_exhausted', withStanding)
}


/**
 * @param {string} code a key of ERRORS
 * @param {object} [meta] tier, token, used, limit
 * @return {Response}
 */
function errorResponse(code, meta = {}) {
  const [status, message] = ERRORS[code]
  return new Response(JSON.stringify({error: {code, message}, ...(meta.tier ? {tier: meta.tier} : {})}), {
    status,
    headers: metaHeaders(meta, {'Content-Type': 'application/json'}),
  })
}


/**
 * The `{used, limit, tier}` the client reads without a second call (§7
 * "Reuse"), the overflow notice, and a freshly minted anonymous token.
 *
 * @param {object} meta
 * @param {object} base
 * @return {Headers}
 */
function metaHeaders(meta, base) {
  const headers = new Headers(base)
  if (meta.tier) {
    headers.set('x-bldrs-ai-tier', meta.tier)
  }
  if (Number.isFinite(meta.used)) {
    headers.set('x-bldrs-ai-used', String(meta.used))
  }
  if (Number.isFinite(meta.limit)) {
    headers.set('x-bldrs-ai-limit', String(meta.limit))
  }
  if (meta.overflow) {
    headers.set('x-bldrs-ai-overflow', 'free_models')
  }
  if (meta.token) {
    headers.set('x-bldrs-ai-token', meta.token)
  }
  return headers
}


/**
 * One structured line per request. Never a body, token, user id or IP.
 *
 * @param {object} fields
 */
function logOutcome(fields) {
  // eslint-disable-next-line no-console -- the one INFO line per request, by design
  console.log(JSON.stringify({fn: 'ai-chat', ...fields}))
}


// Sentry, initialised on first report: a cold start with no DSN pays nothing,
// and nothing here can throw at module scope.
let sentryReady = false
// `condition|tag|day` already reported by this instance. A warm instance
// serves many requests; a broken model is one problem, not one per turn.
const reported = new Set()
// An unset breaker is zero by design (src/quota/aiCredits.js), so every
// request of its tier "trips" it; that's a deploy setting, logged once per
// instance and tier, not a daily Sentry event.
const unconfiguredBreakers = new Set()


/**
 * @param {object} context Netlify's
 * @return {{report: Function, breakerTripped: Function}}
 */
function createReporter(context) {
  /**
   * @param {string} condition
   * @param {object} tags structured fields only: status, model id, reason
   * @return {Promise<void>} resolves once the event is flushed (or skipped)
   */
  const report = async (condition, tags = {}) => {
    const key = `${condition}|${tags.model ?? tags.tier ?? tags.reason ?? ''}|${utcDay(Date.now())}`
    if (reported.has(key)) {
      return
    }
    reported.add(key)
    try {
      if (!sentryReady) {
        Sentry.init({dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: 0})
        sentryReady = true
      }
      Sentry.withScope((scope) => {
        scope.setFingerprint(['ai-chat', condition])
        scope.setTag('component', 'ai-chat')
        scope.setTag('ai_condition', condition)
        for (const [name, value] of Object.entries(tags)) {
          scope.setTag(`ai_${name}`, String(value))
        }
        Sentry.captureMessage(`ai-chat: ${condition}`, 'warning')
      })
      const FLUSH_MS = 2000
      const flushed = Sentry.flush(FLUSH_MS).catch(() => false)
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(flushed)
      } else {
        await flushed
      }
    } catch {
      // Reporting is best-effort; the response doesn't depend on it.
    }
  }
  const breakerTripped = (tier, configured) => {
    if (!configured) {
      if (!unconfiguredBreakers.has(tier)) {
        unconfiguredBreakers.add(tier)
        console.warn(`ai-chat: no spend breaker set for ${tier}; serving its traffic free models only`)
      }
      return
    }
    // Not awaited: the overflowed request carries on; the flush is kept
    // alive by waitUntil, or simply races the stream.
    void report('breaker_tripped', {tier})
  }
  return {report, breakerTripped}
}
