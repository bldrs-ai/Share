import type {LanguageModel} from 'ai'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {AssistError} from './assistError'
import {HOSTED_TRANSPORT_ID, HOSTED_TRANSPORT_LABEL, HostedMeta, hostedMetaOf, relayError} from './hosted'
import {OPENROUTER_KEY_ID} from './keyStore'


/**
 * How the loop reaches a model (ai-workspace.md D1, §4: the model call is the
 * only hop that leaves the browser). A transport hands the loop an AI SDK
 * `LanguageModel` per turn, built fresh so a key changed in settings is used
 * on the next send. #1930 adds the BYOK direct providers behind this same
 * shape; #1932's hosted relay is {@link hostedTransport}.
 */
export interface Transport {
  /** The key-store provider id, e.g. 'openrouter'. */
  readonly id: string
  /** For messages: "Couldn't reach OpenRouter". */
  readonly label: string
  /**
   * @throws {AssistError} 'no_key' when the user hasn't given one
   */
  model(): LanguageModel
  /**
   * The largest request body, in bytes, this transport takes for the request
   * it is about to send, or undefined for no cap of its own. The loop asks
   * before every step and fits that step's request under it (loop.ts
   * `boundStepMessages`): the hosted relay refuses a body over its tier's cap
   * (ai-chat.js `maxBodyBytesFor`) as `ai_bad_request`. May be async: the
   * hosted transport checks which credential the request will carry.
   */
  maxRequestBytes?(): number | undefined | Promise<number | undefined>
}


export interface OpenRouterTransportOptions {
  /** Reads the key at each turn (a `KeyStore` lookup). */
  getKey: () => string | null
  /** An OpenRouter model id, e.g. 'qwen/qwen3.7-flash'. */
  model: string
  /** The API root, ending in `/api/v1`. */
  baseURL: string
  /** Sent as `HTTP-Referer`, OpenRouter's app attribution. */
  appUrl?: string
  /** Sent as `X-Title`. */
  appTitle?: string
  /** For tests: a stand-in for `fetch`. */
  fetch?: typeof fetch
}


/**
 * The user's own OpenRouter key, browser → openrouter.ai (D6). Every request
 * asks OpenRouter to route only to endpoints that don't keep or train on the
 * conversation (`provider.data_collection: 'deny'`, D2/D9); a model with no
 * such endpoint fails rather than quietly sending the conversation to one
 * that does.
 *
 * Chat Completions (`.chat()`), which is what OpenRouter's API is; the
 * Responses-vs-Chat pin of §8 is about OpenAI direct (#1930).
 *
 * @param opts
 * @return the transport
 */
export function openRouterTransport(opts: OpenRouterTransportOptions): Transport {
  return {
    id: OPENROUTER_KEY_ID,
    label: 'OpenRouter',
    model: () => {
      const apiKey = opts.getKey()
      if (!apiKey) {
        throw new AssistError('no_key', 'No OpenRouter key')
      }
      const headers: Record<string, string> = {}
      if (opts.appUrl) {
        headers['HTTP-Referer'] = opts.appUrl
      }
      if (opts.appTitle) {
        headers['X-Title'] = opts.appTitle
      }
      const provider = createOpenRouter({
        apiKey,
        baseURL: opts.baseURL,
        headers,
        // 'strict' sends `stream_options.include_usage`, so the last chunk
        // carries the turn's token usage; OpenRouter is the API we're talking
        // to, so compatibility mode buys nothing.
        compatibility: 'strict',
        ...(opts.fetch ? {fetch: opts.fetch} : {}),
      })
      return provider.chat(opts.model, {provider: {data_collection: 'deny'}, usage: {include: true}})
    },
  }
}


export interface HostedTransportOptions {
  /** The relay's path or URL, e.g. '/.netlify/functions/ai-chat'. Relative resolves against the page. */
  relayUrl: string
  /**
   * The model to ask the relay for; it must be on the relay's list for the
   * caller's tier, which the relay checks on every request. A function is
   * read afresh at each turn, so a choice made in the host's settings (the
   * model picker, #1934) applies from the next turn without a rebuild.
   */
  model: string | (() => string)
  /**
   * The signed-in user's Auth0 access token for this request, or null when
   * signed out (or when getting one failed: the turn then goes anonymous).
   */
  getAuthToken: () => Promise<string | null>
  /** Where the relay's anonymous token is kept between requests and reloads. */
  anonTokens: {get(): string | null, set(token: string): void}
  /** Called with each relay response's metering headers, before its body. */
  onMeta?: (meta: HostedMeta) => void
  /**
   * The body cap to assume for a tier when the relay hasn't said its own
   * (`x-bldrs-ai-max-body-bytes`): null before any response, or when the next
   * request will carry a different credential than the last one did (signed
   * out since, or a token that couldn't be had). Undefined for none. The host
   * knows the defaults (quota/aiCredits.js); this module stays free of
   * Share's config.
   */
  maxRequestBytesFor?: (tier: string | null) => number | undefined
  /** For tests: a stand-in for `fetch`. */
  fetch?: typeof fetch
}


/**
 * Bldrs' hosted assistant: browser → `ai-chat` relay → OpenRouter
 * (ai-workspace.md D1, §5). For a user with no key of their own; the relay
 * holds Bldrs' key, picks the routing (deny included), and meters the turn
 * against the caller's credits.
 *
 * Built on the same `@openrouter/ai-sdk-provider` as the BYOK transport (§9:
 * "one provider covers OpenRouter-with-user-key and our relay"), with its
 * `fetch` replaced so that every request:
 *  - goes to the relay's one URL, whatever path the provider builds;
 *  - carries the caller's Bearer: the Auth0 token when signed in, else the
 *    anonymous token the relay minted earlier (none on the very first call,
 *    which is how one is minted). The provider's own `apiKey` placeholder
 *    never leaves: its Authorization header is replaced;
 *  - keeps a newly minted anonymous token, and hands the metering headers to
 *    `onMeta`;
 *  - turns a relay refusal into a typed {@link AssistError} (hosted.ts), thrown
 *    from fetch so the AI SDK doesn't retry it: out of credits stays out.
 *
 * No `provider` routing options are sent: the relay sets and forces them.
 *
 * @param opts
 * @return the transport
 */
export function hostedTransport(opts: HostedTransportOptions): Transport {
  const baseFetch = opts.fetch ?? globalThis.fetch
  // What the relay last said, for the body cap: its tier and cap, and whether
  // that request went signed in. Null until it has said.
  let lastTier: string | null = null
  let lastCap: number | null = null
  let lastSignedIn: boolean | null = null
  // A token that can't be had sends the request anonymous.
  const authToken = async (): Promise<string | null> => {
    try {
      return await opts.getAuthToken()
    } catch {
      return null
    }
  }
  const relayFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const auth = await authToken()
    const bearer = auth ?? opts.anonTokens.get()
    const headers = new Headers(init?.headers)
    headers.delete('authorization')
    if (bearer) {
      headers.set('Authorization', `Bearer ${bearer}`)
    }
    const base = (globalThis as {location?: {href?: string}}).location?.href ?? 'http://localhost/'
    const res = await baseFetch(new URL(opts.relayUrl, base).toString(), {...init, headers})
    const minted = res.headers.get('x-bldrs-ai-token')
    if (minted && !auth) {
      opts.anonTokens.set(minted)
    }
    try {
      const meta = hostedMetaOf(res.headers)
      // Signing in or out changes these; the next response says so.
      if (meta.tier) {
        lastTier = meta.tier
        lastCap = meta.maxBodyBytes
        lastSignedIn = auth !== null
      }
      opts.onMeta?.(meta)
    } catch {
      // The host's display of the meta must not fail the turn.
    }
    if (!res.ok) {
      throw await relayError(res)
    }
    return res
  }
  return {
    id: HOSTED_TRANSPORT_ID,
    label: HOSTED_TRANSPORT_LABEL,
    model: () => {
      const provider = createOpenRouter({
        // A placeholder the provider requires; relayFetch replaces the header it makes.
        apiKey: 'bldrs-hosted',
        baseURL: 'https://relay.invalid/api/v1',
        compatibility: 'strict',
        fetch: relayFetch as typeof fetch,
      })
      return provider.chat(typeof opts.model === 'function' ? opts.model() : opts.model)
    },
    // The cap the relay named holds only while the next request carries the
    // same kind of credential: a sign-out, or an Auth0 token that can't be
    // refreshed (the request then goes anonymous, `authToken`), changes the
    // tier before the relay can say so (Codex on #2305).
    maxRequestBytes: async () => {
      const signedIn = (await authToken()) !== null
      if (lastSignedIn !== null && signedIn !== lastSignedIn) {
        return opts.maxRequestBytesFor?.(null)
      }
      return lastCap ?? opts.maxRequestBytesFor?.(lastTier)
    },
  }
}


/**
 * One transport whose choice is made afresh at each turn: Share uses the
 * user's own key when they have given one, and the hosted relay otherwise
 * (#1932). `id` and `label` name whichever the latest turn used, so an
 * error the panel words after a turn names the right one.
 *
 * @param choose returns the transport for the next turn
 * @return the transport
 */
export function selectTransport(choose: () => Transport): Transport {
  let current = choose()
  return {
    get id() {
      return current.id
    },
    get label() {
      return current.label
    },
    model: () => {
      current = choose()
      return current.model()
    },
    maxRequestBytes: () => current.maxRequestBytes?.(),
  }
}
