import {assertDefined} from '../../utils/assert'


/**
 * Request a response from the OpenRouter API.
 *
 * @param options Chat completion request options.
 * @return The assistant's reply.
 */
export async function askLLM({
  messages,
  model = 'openrouter/auto',
  apiKey,
}: AskLlmOptions): Promise<string> {
  const openrouterBaseUrl = process.env.OPENROUTER_BASE_URL
  assertDefined(openrouterBaseUrl, 'OPENROUTER_BASE_URL is required')
  const url = `${openrouterBaseUrl}/api/v1/chat/completions`

  const body = {
    model,
    messages,
    provider: {
      order: ['anthropic'] as const,
    },
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://bldrs.ai',
      'X-Title': 'Bldrs Share Assistant',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    console.error('OpenRouter API error:', errorText)
    throw new Error(errorText)
  }

  const data = await res.json() as OpenRouterResponse
  const choice = data.choices?.[0]
  const content = choice?.message?.content
  if (!content) {
    throw new Error('OpenRouter API response did not include content')
  }
  return content.trim()
}


// Types
type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
}

interface AskLlmOptions {
  messages: ChatMessage[]
  model?: string
  apiKey: string
}

interface OpenRouterChoice {
  message: {
    content: string
  }
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[]
}
