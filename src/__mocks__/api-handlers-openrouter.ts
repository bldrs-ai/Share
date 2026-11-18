import {http, HttpHandler} from 'msw'
import {HTTP_BAD_REQUEST, HTTP_OK} from '../net/http'
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
  // this mock only has to be the wire.
  handlers.push(http.post(AI_RELAY_PATH, async ({request}) => {
    const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const anonymous = bearer === '' || bearer.startsWith('ba1.')
    const {chunks, delayMs} = scriptedReply(await request.json() as Parameters<typeof scriptedReply>[0])
    return new Response(sseStream(chunks, delayMs), {
      status: HTTP_OK,
      headers: {
        ...SSE_HEADERS,
        'x-bldrs-ai-tier': anonymous ? 'anonymous' : 'free',
        'x-bldrs-ai-used': '0',
        'x-bldrs-ai-limit': anonymous ? '20000' : '500000',
        ...(bearer === '' ? {'x-bldrs-ai-token': `${MOCK_ANON_TOKEN_PREFIX}${++mintedTokens}`} : {}),
      },
    })
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


/** The relay's path (viewer/tools/assistHost.js AI_RELAY_URL), same origin. */
export const AI_RELAY_PATH = '/.netlify/functions/ai-chat'

/** What the mock relay's minted anonymous tokens start with; a counter follows. */
export const MOCK_ANON_TOKEN_PREFIX = 'ba1.mockAnonymousToken.'
let mintedTokens = 0


const OPENROUTER_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, HTTP-Referer, X-Title',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
}


interface Defines {
  OPENROUTER_BASE_URL: string
}
