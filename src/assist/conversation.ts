import type {ModelMessage} from 'ai'


/**
 * Where a conversation's history lives (ai-workspace.md D10, amended by D15:
 * Assist talks to a store it is handed, and Collab's conversation-store
 * interface is the eventual owner). A conversation belongs to a session
 * (design/new/workspace-sessions.md §4: `sessions/<id>/conversation.jsonl`),
 * which is not built yet, so Assist sees only this interface and the host
 * picks the implementation. Keeping it on the device is #1662.
 *
 * What is stored is the AI SDK's `ModelMessage` objects WHOLE, as
 * `result.responseMessages` returns them — never a flattened
 * `{role, text}`. Provider state rides in `providerOptions` (Gemini thought
 * signatures, OpenRouter `reasoning_details`), and dropping it loses
 * reasoning context silently, with no error (spike #1927, D10). Messages are
 * plain JSON, so a store may serialize them as one JSON line each.
 */
export interface ConversationStore {
  /** Every message of the conversation, oldest first; empty for a new one. */
  load(conversationId: string): Promise<ModelMessage[]>
  /** Add messages at the end, in order. */
  append(conversationId: string, messages: ModelMessage[]): Promise<void>
}


/**
 * A conversation store that lives in this tab's memory and is gone on
 * reload. Each message is kept as its JSON text, one string per message
 * (the line of the JSONL file D10 describes), and parsed again on load. That
 * is deliberate: it makes this store lose exactly what a file-backed one
 * would, so a test against it says something about persistence — an
 * object kept by reference would "survive" anything. (A message holding
 * binary content, an image part's `Uint8Array`, would not survive JSON; no
 * v0 tool or transport produces one.)
 *
 * @return the store
 */
export function createMemoryConversationStore(): ConversationStore {
  const lines = new Map<string, string[]>()
  return {
    load: (conversationId) => Promise.resolve(
      (lines.get(conversationId) ?? []).map((line) => JSON.parse(line) as ModelMessage)),
    append: (conversationId, messages) => {
      const existing = lines.get(conversationId) ?? []
      existing.push(...messages.map((message) => JSON.stringify(message)))
      lines.set(conversationId, existing)
      return Promise.resolve()
    },
  }
}
