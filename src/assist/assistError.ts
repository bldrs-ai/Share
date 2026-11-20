/**
 * The failures an agent turn reports to its host, typed so the host can say
 * what happened and what to do (#1675, "Failures say what happened and what
 * to do"). These are the Reported Conditions of the loop: the host shows the
 * message and sends nothing else anywhere — no conversation text, model name
 * or key reaches analytics or diagnostics from here (design/reqs/README.md,
 * "Privacy and scope").
 *
 * Tool-call failures are a different thing: they go back to the model as a
 * tool result (`errors.ts`, `ToolError`) so it can correct the call, and the
 * turn carries on.
 *
 * Kept free of any `ai` import, so the host can name and word these codes
 * from the main bundle without loading the AI SDK (ai-workspace.md §9,
 * Amendment 1). The AI SDK's errors are recognised by shape below for the
 * same reason.
 */
export type AssistErrorCode =
  /** No key for the transport's provider. Nothing was sent. */
  | 'no_key'
  /** The provider refused the key: HTTP 401 or 403. */
  | 'bad_key'
  /** The provider's account is out of credits: HTTP 402. */
  | 'no_credits'
  /** The provider is rate limiting: HTTP 429. */
  | 'rate_limited'
  /**
   * The provider refused the request itself: HTTP 400 or 413. In practice a
   * conversation past the model's context window, which no retry fixes.
   */
  | 'bad_request'
  /**
   * HTTP 404: the model or endpoint isn't there. For OpenRouter this is also
   * what a model with no `data_collection: 'deny'` endpoint answers, and
   * what the user's own account provider settings can cause by leaving it
   * none. The model is Bldrs' choice (Share's ASSIST_MODEL), so the host
   * reports it either way.
   */
  | 'unavailable'
  /** The request never got an HTTP answer: offline, DNS, CORS. */
  | 'network'
  /** The user stopped the reply. */
  | 'aborted'
  /** A turn is already streaming, or an undo is running, in this session. */
  | 'busy'
  /** Any other provider or SDK failure; `status` carries the HTTP status when there was one. */
  | 'provider'
  // The hosted relay's own refusals (hosted.ts maps its codes onto these).
  // They carry the caller's tier, which decides what the user is told.
  /** The tier's assistant credits are spent for the window: sign in, or upgrade. Expected. */
  | 'credits_exhausted'
  /** The day's free-model requests are spent (they cost no credits, so they're counted). Expected. */
  | 'free_requests_exhausted'
  /** The free models are busy: the breaker had overflowed to them and they refused too. Expected. */
  | 'assistant_busy'
  /** The relay or its upstream failed. The relay reports it; the page doesn't. */
  | 'service_unavailable'
  /** The Auth0 sign-in the request carried has lapsed. */
  | 'session_expired'


/** A typed failure thrown by Assist's own code (a transport with no key, a busy session). */
export class AssistError extends Error {
  code: AssistErrorCode
  status?: number
  /** The hosted relay's tier for the caller ('anonymous' | 'free' | 'pro'), when it said. */
  tier?: string
  /**
   * For `credits_exhausted`: when the relay says the budget admits again
   * (epoch ms), when it said. A host can hold the turn until then and send
   * it again (Share's paused turn); without it the refusal is final.
   */
  resumeAt?: number


  /**
   * @param code
   * @param message for a developer; hosts word the user-facing text with {@link assistErrorMessage}
   * @param status the HTTP status, when there was one
   * @param tier the hosted relay's tier for the caller, when it said
   * @param resumeAt epoch ms the relay said its budget admits again, when it said
   */
  constructor(code: AssistErrorCode, message: string, status?: number, tier?: string, resumeAt?: number) {
    super(message)
    this.name = 'AssistError'
    this.code = code
    if (status !== undefined) {
      this.status = status
    }
    if (tier !== undefined) {
      this.tier = tier
    }
    if (resumeAt !== undefined) {
      this.resumeAt = resumeAt
    }
  }
}


const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_PAYMENT_REQUIRED = 402
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_TOO_MANY_REQUESTS = 429


/**
 * Classify whatever a turn failed with.
 *
 * The AI SDK wraps an HTTP failure in an `APICallError` (`name`
 * 'AI_APICallError') carrying `statusCode`, and a failure to connect at all
 * (`fetch` rejecting: offline, DNS, a CORS refusal) in the same error with no
 * `statusCode` and the `TypeError` as `cause`. After its retries it wraps the
 * last one in a `RetryError` ('AI_RetryError', `lastError`). All three are
 * matched by shape, not `instanceof`, so this module needs no SDK import and
 * still works when the host and the lazy bundle hold different copies.
 *
 * @param error what the stream or the call threw
 * @param aborted whether the turn's signal had fired; an abort can surface as
 *   any of several errors depending on where the request was when it fired
 * @return the code and, for an HTTP failure, its status
 */
export function classifyError(error: unknown, aborted = false):
  {code: AssistErrorCode, status?: number, tier?: string, resumeAt?: number} {
  if (aborted || isAbortError(error)) {
    return {code: 'aborted'}
  }
  const inner = unwrapRetry(error)
  if (inner instanceof AssistError || (isObject(inner) && inner.name === 'AssistError')) {
    const {code, status, tier, resumeAt} = inner as AssistError
    return {code, ...(status === undefined ? {} : {status}), ...(tier === undefined ? {} : {tier}),
      ...(resumeAt === undefined ? {} : {resumeAt})}
  }
  if (isAbortError(inner)) {
    return {code: 'aborted'}
  }
  const status = isObject(inner) && typeof inner.statusCode === 'number' ? inner.statusCode : undefined
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return {code: 'bad_key', status}
  }
  if (status === HTTP_PAYMENT_REQUIRED) {
    return {code: 'no_credits', status}
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return {code: 'rate_limited', status}
  }
  if (status === HTTP_BAD_REQUEST || status === HTTP_PAYLOAD_TOO_LARGE) {
    return {code: 'bad_request', status}
  }
  if (status === HTTP_NOT_FOUND) {
    return {code: 'unavailable', status}
  }
  if (status !== undefined) {
    return {code: 'provider', status}
  }
  // No HTTP answer: fetch itself rejected, bare or wrapped by the SDK. By
  // name, not `instanceof TypeError`: the TypeError can come from another
  // realm than this module's (a test DOM over Node's fetch, an iframe's).
  if (isTypeError(inner) || (isObject(inner) && inner.name === 'AI_APICallError') ||
      (isObject(inner) && isTypeError(inner.cause))) {
    return {code: 'network'}
  }
  return {code: 'provider'}
}


/**
 * What to tell the user for each code: what happened and what to do.
 *
 * @param code
 * @param provider the transport's label, e.g. 'OpenRouter'
 * @param status the HTTP status, for 'provider'
 * @param tier the hosted relay's tier, for the hosted codes: what a signed-out
 *   user can do (sign in) differs from a free user (upgrade) and from Pro (wait)
 * @return one or two sentences
 */
export function assistErrorMessage(code: AssistErrorCode, provider: string, status?: number, tier?: string): string {
  switch (code) {
    case 'credits_exhausted':
      if (tier === 'pro') {
        return 'You\'ve used your Pro assistant credits for the last 30 days. They come back as the days roll ' +
          'on; meanwhile you can add your own OpenRouter key in the assistant\'s settings.'
      }
      if (tier === 'free') {
        return 'You\'ve used your free assistant credits for the last 30 days. Upgrade to Pro for substantially ' +
          'more, or add your own OpenRouter key in the assistant\'s settings.'
      }
      return 'You\'ve used today\'s free assistant allowance. Sign in for more, or add your own OpenRouter key ' +
        'in the assistant\'s settings.'
    case 'free_requests_exhausted':
      return tier === 'anonymous' ?
        'You\'ve used today\'s free-model requests. Sign in to keep going, or try again tomorrow.' :
        'You\'ve used today\'s free-model requests. Try again tomorrow.'
    case 'assistant_busy':
      return tier === 'anonymous' ?
        'The free assistant is busy right now. Sign in to keep going, or try again later.' :
        'The free models are busy right now. Try again in a few minutes.'
    case 'service_unavailable': return `${provider} isn't available right now. Try again in a few minutes, or add ` +
      'your own OpenRouter key in the assistant\'s settings.'
    case 'session_expired': return 'Your sign-in has expired. Sign in again to keep using your assistant credits.'
    case 'no_key': return `Add your ${provider} key in the assistant's settings (the gear) to start.`
    case 'bad_key': return `${provider} didn't accept your key. Check it in the assistant's settings and try again.`
    case 'no_credits': return `Your ${provider} account is out of credits. Add credits with ${provider}, then try again.`
    case 'rate_limited': return `${provider} is limiting requests right now. Wait a minute and try again.`
    case 'bad_request': return `${provider} couldn't take this request; the conversation may be too long. ` +
      'Start a new chat to carry on.'
    case 'unavailable': return `This AI model isn't available from ${provider} right now. It may be our ` +
      `configuration, or your ${provider} provider settings leave it no endpoint.`
    case 'network': return `Couldn't reach ${provider}. Check your connection and try again.`
    case 'aborted': return 'Stopped.'
    case 'busy': return 'The assistant is still answering or undoing. Wait for it, or stop it first.'
    default: return `${provider} returned an error${status ? ` (HTTP ${status})` : ''}. Try again in a moment.`
  }
}


/**
 * @param error
 * @return the innermost error a RetryError wraps, or `error` itself
 */
function unwrapRetry(error: unknown): unknown {
  let current = error
  for (let depth = 0; depth < MAX_UNWRAP && isObject(current) && current.name === 'AI_RetryError' &&
    current.lastError !== undefined; depth++) {
    current = current.lastError
  }
  return current
}
const MAX_UNWRAP = 4


/**
 * @param error
 * @return whether it is a TypeError from any realm
 */
function isTypeError(error: unknown): boolean {
  return error instanceof TypeError || (isObject(error) && error.name === 'TypeError')
}


/**
 * @param error
 * @return whether it is a DOM or SDK abort
 */
function isAbortError(error: unknown): boolean {
  return isObject(error) && (error.name === 'AbortError' || error.name === 'ResponseAborted')
}


/**
 * @param value
 * @return whether it can carry fields
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
