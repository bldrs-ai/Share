import {http, HttpHandler} from 'msw'
import {HTTP_BAD_REQUEST, HTTP_OK, HTTP_PAYMENT_REQUIRED} from '../net/http'
import {ASSIST_FREE_MODELS, ASSIST_MODEL} from '../tools/assistModels'
import {assertDefined} from '../utils/assert'
import {SSE_HEADERS, scriptedReply, sseStream} from '../assist/openrouterSse.fixture'


/**
 * Returns the HTTP handlers for the OpenRouter API.
 *
 * The chat endpoint answers with a scripted SSE stream (`openrouterSse.ts`
 * `scriptedReply`): the same wire format the real API streams, decided from
 * the request the client sent. So under Jest and the Playwright build the
 * assistant's real loop runs against it — tool calls go through the real
 * registry, and their results decide the next reply. Real openrouter.ai is
 * refused here, and `tests/e2e/networkGuard.ts` blocks it in Playwright too.
 *
 * Also answers Bldrs' hosted relay, `ai-chat`, which the assistant uses for a
 * user with no key of their own (#1932).
 *
 * @param defines - The defines that contains the OPENROUTER_BASE_URL.
 * @return The HTTP handlers.
 */
export default function apiHandlersOpenrouter(defines: Defines): HttpHandler[] {
  const handlers: HttpHandler[] = []
  const openrouterBaseUrl = defines.OPENROUTER_BASE_URL
  assertDefined(openrouterBaseUrl, 'OPENROUTER_BASE_URL is required')
  const chatCompletionsEndpoint = `${openrouterBaseUrl}/api/v1/chat/completions*`

  handlers.push(http.options(chatCompletionsEndpoint, () => {
    return new Response(null, {
      status: HTTP_OK,
      headers: OPENROUTER_CORS_HEADERS,
    })
  }))

  handlers.push(http.post(chatCompletionsEndpoint, async ({request}) => {
    const {chunks, delayMs} = scriptedReply(await request.json() as Parameters<typeof scriptedReply>[0])
    return new Response(sseStream(chunks, delayMs), {
      status: HTTP_OK,
      headers: {...OPENROUTER_CORS_HEADERS, ...SSE_HEADERS},
    })
  }))

  // Bldrs' hosted relay (netlify/functions/ai-chat.js), as the app sees it:
  // same SSE as OpenRouter's (the relay passes it through), plus the relay's
  // own headers. A request without a Bearer is anonymous and gets a minted
  // token, as the real relay does; one with a `ba1.` token stays anonymous;
  // anything else is a signed-in free user. The ledger, the breaker and the
  // allowlist are the relay's, tested against it (netlify/functions/_tests/);
  // this mock only has to be the wire. `window.__mockAiRelay` lets a spec say
  // what the relay reports next (see relayKnob).
  handlers.push(http.post(AI_RELAY_PATH, async ({request}) => {
    const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const anonymous = bearer === '' || bearer.startsWith('ba1.')
    const knob = relayKnob()
    const tier = knob.tier ?? (anonymous ? 'anonymous' : 'free')
    const meter = {
      'x-bldrs-ai-tier': tier,
      'x-bldrs-ai-used': String(knob.used ?? 0),
      'x-bldrs-ai-limit': String(knob.limit ?? (anonymous ? DEFAULT_ANONYMOUS_LIMIT : DEFAULT_FREE_LIMIT)),
    }
    // The real relay's refusal (netlify/functions/ai-chat.js refusalResponse,
    // replay scenario credits-exhausted.json): 402, the code and the tier in
    // the body, the metering headers still set. With `resumeAt`, also when
    // the budget admits again, in the body and its header, and the refusal
    // lasts only until then, as the relay's window turning over does.
    const resumeAtMs = knob.resumeAt === undefined ? NaN : Date.parse(knob.resumeAt)
    if (knob.exhausted && !(Date.now() >= resumeAtMs)) {
      const resume = Number.isFinite(resumeAtMs) ? new Date(resumeAtMs).toISOString() : null
      return new Response(JSON.stringify({error: {code: 'ai_credits_exhausted', message: 'Out of credits'}, tier,
        ...(resume ? {resumeAt: resume} : {})}), {
        status: HTTP_PAYMENT_REQUIRED,
        headers: {'Content-Type': 'application/json', ...meter, ...(resume ? {'x-bldrs-ai-resume-at': resume} : {})},
      })
    }
    const body = await request.json() as Parameters<typeof scriptedReply>[0] & {model?: string}
    // The real relay's model check (ai-chat.js, _lib/aiCatalogue.js): the
    // default chain and the free alias on every tier, the catalogue's models
    // for Pro only; anything else is 400 `ai_model_not_allowed`. So a client
    // that sends the wrong id, or a Pro pick on another tier, fails here as
    // it would there.
    if (!relayAllows(body.model, tier)) {
      return new Response(JSON.stringify({error: {code: 'ai_model_not_allowed', message: 'Not on this tier'}, tier}), {
        status: HTTP_BAD_REQUEST,
        headers: {'Content-Type': 'application/json', ...meter},
      })
    }
    const {chunks, delayMs} = scriptedReply(body)
    return new Response(sseStream(chunks, delayMs), {
      status: HTTP_OK,
      headers: {
        ...SSE_HEADERS,
        ...meter,
        ...(bearer === '' ? {'x-bldrs-ai-token': `${MOCK_ANON_TOKEN_PREFIX}${++mintedTokens}`} : {}),
      },
    })
  }))

  // The relay's model list for the picker (ai-chat.js `GET ?catalogue`),
  // in its shape: the curated models, then a catalogue model for Pro.
  handlers.push(http.get(AI_RELAY_PATH, ({request}) => {
    if (!new URL(request.url).searchParams.has('catalogue')) {
      return new Response(JSON.stringify({error: {code: 'ai_method_not_allowed'}}), {status: HTTP_BAD_REQUEST})
    }
    return new Response(JSON.stringify(MOCK_AI_CATALOGUE), {status: HTTP_OK, headers: {'Content-Type': 'application/json'}})
  }))

  // Block prod
  handlers.push(http.all('https://openrouter.ai/*', () => {
    return new Response(JSON.stringify({error: 'Unexpected request from client in MSW sandbox'}), {
      status: HTTP_BAD_REQUEST,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return handlers
}


/** The relay's path (tools/assistHost.js AI_RELAY_URL), same origin. */
export const AI_RELAY_PATH = '/.netlify/functions/ai-chat'


/** A Pro-only model the mock catalogue lists beyond the curated ones. */
export const MOCK_CATALOGUE_MODEL = {id: 'x-ai/grok-4.7', name: 'SpaceXSI: Grok 4.7', price: {input: 4, output: 12},
  tiers: ['pro']}

/** What the mock relay answers `GET ?catalogue` with: the real route's shape, trimmed. */
export const MOCK_AI_CATALOGUE = {
  source: 'live',
  default: ASSIST_MODEL,
  free: ASSIST_FREE_MODELS,
  models: [
    {id: ASSIST_MODEL, name: 'Qwen: Qwen3.7 Flash', price: {input: 0.2, output: 0.8},
      tiers: ['anonymous', 'free', 'pro']},
    {id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5', price: {input: 1, output: 5},
      tiers: ['pro']},
    MOCK_CATALOGUE_MODEL,
  ],
}


/**
 * @param model the request's `model`
 * @param tier the caller's
 * @return whether the real relay would serve it on that tier
 */
function relayAllows(model: string | undefined, tier: string): boolean {
  if (model === undefined || model === MOCK_AI_CATALOGUE.default || model === MOCK_AI_CATALOGUE.free) {
    return true
  }
  const listed = MOCK_AI_CATALOGUE.models.find((m) => m.id === model)
  return Boolean(listed && listed.tiers.includes(tier))
}

/**
 * What a spec sets on `window.__mockAiRelay` to steer the mock relay's next
 * answers, as `window.__mockQuotaLoads` does for record-load. Unset fields
 * keep the defaults: the caller's own tier, 0 used, and the placeholder
 * limits of src/quota/aiCredits.js in micro-USD.
 */
export interface MockAiRelay {
  tier?: 'anonymous' | 'free' | 'pro'
  used?: number
  limit?: number
  /** Refuse with 402 `ai_credits_exhausted`, as the relay does. */
  exhausted?: boolean
  /**
   * With `exhausted`: the refusal's `resumeAt` (ISO-8601), and the time from
   * which the mock serves again. Without it, the refusal carries none (an
   * older relay) and lasts.
   */
  resumeAt?: string
}

const DEFAULT_ANONYMOUS_LIMIT = 20000
const DEFAULT_FREE_LIMIT = 500000


/** @return the spec's steering for the mock relay, or none */
function relayKnob(): MockAiRelay {
  return (typeof window !== 'undefined' && (window as unknown as {__mockAiRelay?: MockAiRelay}).__mockAiRelay) || {}
}


/** What the mock relay's minted anonymous tokens start with; a counter follows. */
// The shared anonymous metering token's shape (quota/meterToken.js), as the relay mints it.
export const MOCK_ANON_TOKEN_PREFIX = 'bm1.mockAnonymousToken.'
let mintedTokens = 0


const OPENROUTER_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, HTTP-Referer, X-Title',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
}


interface Defines {
  OPENROUTER_BASE_URL: string
}
