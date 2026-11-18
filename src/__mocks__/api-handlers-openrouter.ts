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


const OPENROUTER_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, HTTP-Referer, X-Title',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
}


interface Defines {
  OPENROUTER_BASE_URL: string
}
