import {http, HttpHandler} from 'msw'
import {HTTP_BAD_REQUEST, HTTP_OK} from '../net/http'
import {assertDefined} from '../utils/assert'


/**
 * Returns the HTTP handlers for the OpenRouter API.
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

  handlers.push(http.post(chatCompletionsEndpoint, () => {
    return new Response(JSON.stringify(MOCK_OPENROUTER_RESPONSE), {
      status: HTTP_OK,
      headers: {
        ...OPENROUTER_CORS_HEADERS,
        'Content-Type': 'application/json',
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


const MOCK_OPENROUTER_RESPONSE = {
  id: 'gen-1762456677-D3H9DUqGnL4sGelEXw4A',
  provider: 'OpenAI',
  model: 'openai/gpt-5-nano',
  object: 'chat.completion',
  created: 1762456678,
  choices: [
    {
      logprobs: null,
      finish_reason: 'stop',
      native_finish_reason: 'completed',
      index: 0,
      message: {
        role: 'assistant',
        content: '```json\n{\n  "assistant_response": "Test received.",\n  "client_code": "return [];"\n}\n```',
        refusal: null,
        reasoning: '**Lots of reasoning here...**',
        reasoning_details: [
          {
            type: 'reasoning.summary',
            summary: '**Lots of reasoning here...**',
            format: 'openai-responses-v1',
            index: 0,
          },
          {
            type: 'reasoning.encrypted',
            data: 'bigEncryptedDataSDFS*DFDF*',
            id: 'rs_06c198dbc4fd6e6a01690cf4676e1c8197999f710179c9f82b',
            format: 'openai-responses-v1',
            index: 0,
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 514,
    completion_tokens: 1438,
    total_tokens: 1952,
    completion_tokens_details: {
      reasoning_tokens: 1408,
    },
  },
}


const OPENROUTER_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, HTTP-Referer, X-Title',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
}


// Types
export interface Defines {
  OPENROUTER_BASE_URL: string
}
