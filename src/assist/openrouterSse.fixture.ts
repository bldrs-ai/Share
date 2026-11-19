/**
 * Scripted OpenRouter Chat Completions streams, for the MSW handler
 * (`src/__mocks__/api-handlers-openrouter.ts`, used by both Jest and the
 * Playwright build)
 * and for unit tests that hand a transport a fake `fetch`.
 *
 * The bytes are the wire format the real API streams (OpenAI-shape
 * `chat.completion.chunk` events over SSE, then `[DONE]`), so what parses
 * them in a test is the real `@openrouter/ai-sdk-provider` and the real AI
 * SDK loop, not a mock of either. ai-workspace.md §14: tests never call a
 * real provider, and a broken mock must fail rather than fall through.
 */


/** One SSE event's JSON payload. */
type Chunk = Record<string, unknown>


/** The model id the mock reports. Not the one the client asked for; nothing reads it. */
const MOCK_MODEL = 'mock/scripted'


/**
 * @param choice the one choice of this chunk
 * @return a `chat.completion.chunk`
 */
function chunk(choice: Chunk | null, extra: Chunk = {}): Chunk {
  return {
    id: 'gen-mock', object: 'chat.completion.chunk', created: 1762456678, model: MOCK_MODEL,
    choices: choice ? [{index: 0, finish_reason: null, ...choice}] : [],
    ...extra,
  }
}


/**
 * @param text the assistant's reply
 * @param pieces how many deltas to split it into, so the client sees it stream
 * @return chunks that stream `text`, then stop
 */
export function textReply(text: string, pieces = 3): Chunk[] {
  const size = Math.max(1, Math.ceil(text.length / pieces))
  const deltas: Chunk[] = []
  for (let i = 0; i < text.length; i += size) {
    deltas.push(chunk({delta: i === 0 ? {role: 'assistant', content: text.slice(i, i + size)} :
      {content: text.slice(i, i + size)}}))
  }
  return [...deltas, ...finish('stop')]
}


/**
 * @param calls the tool calls, by their WIRE name (`model_query`, assist/session.ts#wireToolName)
 * @param preamble text the model says before calling, if any
 * @return chunks that make the calls, then stop for tool results
 */
export function toolCalls(calls: Array<{id: string, name: string, args: unknown}>, preamble = ''): Chunk[] {
  const out: Chunk[] = preamble ? [chunk({delta: {role: 'assistant', content: preamble}})] : []
  calls.forEach(({id, name, args}, index) => {
    out.push(chunk({delta: {
      ...(index === 0 && !preamble ? {role: 'assistant'} : {}),
      tool_calls: [{index, id, type: 'function', function: {name, arguments: JSON.stringify(args)}}],
    }}))
  })
  return [...out, ...finish('tool_calls')]
}


/**
 * @param reason 'stop' or 'tool_calls'
 * @return the finishing chunk, then the usage chunk `stream_options.include_usage` asks for
 */
function finish(reason: string): Chunk[] {
  return [
    chunk({delta: {}, finish_reason: reason}),
    chunk(null, {usage: {prompt_tokens: 120, completion_tokens: 12, total_tokens: 132}}),
  ]
}


const encoder = new TextEncoder()


/**
 * @param chunks
 * @return the SSE body text, `[DONE]` last
 */
export function sseText(chunks: Chunk[]): string {
  return `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`
}


/**
 * @param chunks
 * @param delayMs pause before each event, so a reply can be stopped mid-stream
 * @return the SSE body as a byte stream
 */
export function sseStream(chunks: Chunk[], delayMs = 0): ReadableStream<Uint8Array> {
  const events = [...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n']
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      const next = events.shift()
      if (cancelled) {
        return
      }
      if (next === undefined) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(next))
    },
    cancel() {
      cancelled = true
    },
  })
}


export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
}


/** What the scripted conversation says; tests assert on these strings. */
export const SCRIPT = {
  /** A prompt containing this runs the two-tool loop below. */
  selectPrompt: 'select the proxies',
  /** Said before the first tool call. */
  preamble: 'Looking for the proxies. ',
  /**
   * @param n how many the select reported
   * @return the final answer, after view.select reports back
   */
  selectedAnswer: (n: number) => `Done: selected all ${n} proxies.`,
  /** A prompt containing this streams slowly, for Stop. */
  longPrompt: 'tell me a long story',
  longWord: 'story ',
  longWords: 200,
  longDelayMs: 100,
  /** A prompt containing this gets a Markdown reply, streamed in pieces. */
  markdownPrompt: 'answer in markdown',
  markdownReply: '**Project**: Bldrs\n\n- first item\n- second item\n\nTry `view.select` next.\n\n' +
    '| Tool | Does |\n|------|------|\n| view.select | selects |',
  /** Any other prompt gets this, as the old bot mock did. */
  fallback: 'Test received.',
  queryType: 'IfcBuildingElementProxy',
}


/** An OpenAI-shape message as the client sends it. */
interface WireMessage {
  role: string
  content?: unknown
  tool_call_id?: string
}


/**
 * The scripted model: decides the next reply from the request the client
 * sent, so the conversation runs through the REAL tool registry. For the
 * select prompt it asks `model.query` for the proxies, then selects every
 * ref the query actually returned, then answers with the count the select
 * actually reported. A registry that didn't run the tools would leave it
 * nothing to select.
 *
 * @param body the parsed request body
 * @return the reply's chunks and the delay between them
 */
export function scriptedReply(body: {messages?: WireMessage[]}): {chunks: Chunk[], delayMs: number} {
  const messages = body.messages ?? []
  const last = messages[messages.length - 1]
  if (last?.role === 'tool') {
    const result = parseJson(last.content)
    if (Array.isArray(result?.items)) {
      const refs = (result.items as Array<{ref: string}>).map(({ref}) => ref)
      return {chunks: toolCalls([{id: 'call_select', name: 'view_select', args: {refs}}]), delayMs: 0}
    }
    if (typeof result?.selected === 'number') {
      return {chunks: textReply(SCRIPT.selectedAnswer(result.selected)), delayMs: 0}
    }
    return {chunks: textReply(`The tool said: ${JSON.stringify(result)}`), delayMs: 0}
  }
  const prompt = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
  if (prompt.includes(SCRIPT.selectPrompt)) {
    return {
      chunks: toolCalls([{id: 'call_query', name: 'model_query', args: {ifcType: SCRIPT.queryType}}], SCRIPT.preamble),
      delayMs: 0,
    }
  }
  if (prompt.includes(SCRIPT.markdownPrompt)) {
    // Many small pieces, so a marker is split across chunks somewhere.
    return {chunks: textReply(SCRIPT.markdownReply, SCRIPT.markdownReply.length / 4), delayMs: 0}
  }
  if (prompt.includes(SCRIPT.longPrompt)) {
    return {chunks: textReply(SCRIPT.longWord.repeat(SCRIPT.longWords), SCRIPT.longWords), delayMs: SCRIPT.longDelayMs}
  }
  return {chunks: textReply(SCRIPT.fallback), delayMs: 0}
}


/**
 * @param content a tool message's content: JSON text, or parts holding it
 * @return the parsed object, or null
 */
function parseJson(content: unknown): Record<string, unknown> | null {
  const text = typeof content === 'string' ? content :
    Array.isArray(content) ? content.map((part) => (part as {text?: string}).text ?? '').join('') : ''
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}
