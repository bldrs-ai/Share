import type {LanguageModel} from 'ai'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {AssistError} from './assistError'
import {OPENROUTER_KEY_ID} from './keyStore'


/**
 * How the loop reaches a model (ai-workspace.md D1, §4: the model call is the
 * only hop that leaves the browser). A transport hands the loop an AI SDK
 * `LanguageModel` per turn, built fresh so a key changed in settings is used
 * on the next send. #1930 adds the BYOK direct providers and #1932 the hosted
 * relay behind this same shape; this slice has OpenRouter only.
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
