/**
 * The hosted transport's wire contract with Bldrs' `ai-chat` relay
 * (netlify/functions/ai-chat.js; ai-workspace.md §5 D2, §7 D5), SDK-free so
 * the host can name the transport and read its metering from the main bundle.
 * The transport itself, which needs the AI SDK, is `transport.ts`
 * `hostedTransport`, in the lazy runtime.
 *
 * Relay → client, on every response:
 *  - `x-bldrs-ai-tier`: 'anonymous' | 'free' | 'pro'
 *  - `x-bldrs-ai-used`, `x-bldrs-ai-limit`: the identity's spend and budget in
 *    micro-USD, before this request (ai-workspace.md §7 "Reuse": the client
 *    needs no second call for a meter)
 *  - `x-bldrs-ai-overflow: free_models`: the tier's daily breaker had
 *    tripped, so this reply comes from the free models (§6 path 3)
 *  - `x-bldrs-ai-token`: a freshly minted anonymous token, to send as the
 *    Bearer from now on (signed out only)
 *  - `x-bldrs-ai-resume-at`: on an `ai_credits_exhausted` refusal, when the
 *    budget admits again (ISO-8601 UTC); also `resumeAt` in the body
 * and, on a refusal, a JSON body `{error: {code: 'ai_…', message}, tier, resumeAt?}`.
 */
import {AssistError, AssistErrorCode} from './assistError'


/** The transport id, for reports (never a model or a key). */
export const HOSTED_TRANSPORT_ID = 'hosted'
/** How messages name the hosted assistant: "Couldn't reach Bldrs AI". */
export const HOSTED_TRANSPORT_LABEL = 'Bldrs AI'


/** What the relay said about the caller's credits, per response. */
export interface HostedMeta {
  tier: string | null
  /** micro-USD spent in the window, before this request; null when not said */
  used: number | null
  /** micro-USD budget for the window; null when not said */
  limit: number | null
  /** this reply comes from the free models because the breaker tripped */
  overflow: boolean
}


/**
 * @param headers a relay response's
 * @return its metering headers
 */
export function hostedMetaOf(headers: Headers): HostedMeta {
  const number = (name: string) => {
    const value = headers.get(name)
    return value !== null && /^\d+$/.test(value) ? Number(value) : null
  }
  return {
    tier: headers.get('x-bldrs-ai-tier'),
    used: number('x-bldrs-ai-used'),
    limit: number('x-bldrs-ai-limit'),
    overflow: headers.get('x-bldrs-ai-overflow') === 'free_models',
  }
}


/**
 * The relay's error codes, as the Assist codes the host words. Auth0's own
 * 401 codes (from `_lib/auth0.js`, which the relay passes through) mean the
 * sign-in itself has lapsed.
 */
const RELAY_CODES: Record<string, AssistErrorCode> = {
  ai_credits_exhausted: 'credits_exhausted',
  ai_free_requests_exhausted: 'free_requests_exhausted',
  ai_too_many_requests: 'rate_limited',
  ai_busy: 'assistant_busy',
  ai_bad_request: 'bad_request',
  ai_request_rejected: 'bad_request',
  // The model Share asked for isn't on the relay's list for this tier: the
  // host and the relay disagree, which is ours to fix (the panel reports it).
  ai_model_not_allowed: 'unavailable',
  // The relay has already reported these server-side (ai-chat.js).
  ai_model_unavailable: 'service_unavailable',
  ai_upstream_error: 'service_unavailable',
  ai_unavailable: 'service_unavailable',
  ai_not_configured: 'service_unavailable',
  ai_method_not_allowed: 'service_unavailable',
  missing_auth0_token: 'session_expired',
  invalid_auth0_token: 'session_expired',
}


/**
 * The failure a refused relay response stands for. Reads the body only for
 * its code and tier; nothing else from it is kept or shown.
 *
 * @param res a non-2xx relay response
 * @return the AssistError to throw
 */
export async function relayError(res: Response): Promise<AssistError> {
  let code: string | undefined
  let tier: string | undefined
  let resumeAt: number | undefined
  try {
    const body = await res.json() as {error?: string | {code?: string}, tier?: string, resumeAt?: string}
    code = typeof body.error === 'string' ? body.error : body.error?.code
    tier = typeof body.tier === 'string' ? body.tier : undefined
    resumeAt = parseResumeAt(body.resumeAt)
  } catch {
    // Not the relay's JSON: the platform answered (a 502 page, a timeout).
  }
  const mapped = code === undefined ? undefined : RELAY_CODES[code]
  const assistCode = mapped ?? 'provider'
  // Only an out-of-credits refusal can be waited out; any other code's
  // resumeAt (none is sent today) is ignored.
  const resume = assistCode === 'credits_exhausted' ?
    (resumeAt ?? parseResumeAt(res.headers.get('x-bldrs-ai-resume-at'))) : undefined
  return new AssistError(assistCode, `relay answered ${res.status}${code ? ` ${code}` : ''}`,
    res.status, tier ?? res.headers.get('x-bldrs-ai-tier') ?? undefined, resume)
}


/**
 * @param value the relay's `resumeAt`, an ISO-8601 instant
 * @return epoch ms, or undefined when absent or not a date
 */
function parseResumeAt(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}
