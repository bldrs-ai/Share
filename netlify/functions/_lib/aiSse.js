/*
 * Reads OpenRouter's Chat Completions SSE stream as it passes through the
 * relay, for the one number the ledger needs: the final chunk's
 * `usage.cost` (design/new/ai-workspace.md §5 step 5, "Meters"). The bytes
 * themselves go to the client untouched; this only watches them.
 *
 * OpenRouter always includes usage in the last chunk before `[DONE]`
 * (`usage: {include: true}` is deprecated, usage accounting docs). It also
 * names the generation (`id: 'gen-…'`) on every chunk, which is the key for a
 * later reconciliation through `/api/v1/generation?id=` (§5 Amendment 3), and
 * the model that actually served (which may be a fallback).
 *
 * Mid-stream errors arrive as a chunk with an `error` object; they're noted
 * so the relay can tell "ended without usage" from "ended clean".
 */


const MICRO_USD_PER_USD = 1000000
const FLOAT_NOISE = 1e-6


/**
 * @return {{push: Function, end: Function, result: Function}} an incremental parser
 */
export function createUsageWatcher() {
  const decoder = new TextDecoder()
  let pending = ''
  const seen = {cost: null, generationId: null, model: null, promptTokens: null, completionTokens: null,
    error: false, done: false}

  const onData = (payload) => {
    if (payload === '[DONE]') {
      seen.done = true
      return
    }
    let chunk
    try {
      chunk = JSON.parse(payload)
    } catch {
      return
    }
    if (!chunk || typeof chunk !== 'object') {
      return
    }
    if (typeof chunk.id === 'string' && !seen.generationId) {
      seen.generationId = chunk.id
    }
    if (typeof chunk.model === 'string') {
      seen.model = chunk.model
    }
    if (chunk.error) {
      seen.error = true
    }
    const usage = chunk.usage
    if (usage && typeof usage === 'object') {
      if (typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0) {
        seen.cost = usage.cost
      }
      if (typeof usage.prompt_tokens === 'number') {
        seen.promptTokens = usage.prompt_tokens
      }
      if (typeof usage.completion_tokens === 'number') {
        seen.completionTokens = usage.completion_tokens
      }
    }
  }

  const consumeLines = () => {
    let newline
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, '')
      pending = pending.slice(newline + 1)
      // SSE comments (`: OPENROUTER PROCESSING` keep-alives) and blank
      // separators carry nothing; only `data:` lines do.
      if (line.startsWith('data:')) {
        onData(line.slice('data:'.length).trim())
      }
    }
  }

  return {
    /** @param {Uint8Array} bytes the next piece of the body, as received */
    push(bytes) {
      pending += decoder.decode(bytes, {stream: true})
      consumeLines()
    },
    /** Flush whatever is left once the body has ended. */
    end() {
      pending += decoder.decode()
      if (pending) {
        pending += '\n'
        consumeLines()
      }
    },
    /** @return {object} what was seen so far, with `micro` the cost in micro-USD (rounded up) or null */
    result() {
      // Rounded up, less a float's noise: 0.00015 * 1e6 is 150.00000000000003,
      // which a bare ceil would bill as 151.
      const micro = seen.cost === null ? null : Math.max(0, Math.ceil((seen.cost * MICRO_USD_PER_USD) - FLOAT_NOISE))
      return {...seen, micro}
    },
  }
}
