/**
 * Where the user's provider keys are held (ai-workspace.md §8, D6 "Key
 * custody"). This slice (#1675) ships only the session store below: a key
 * lives in this tab's memory and is gone when the tab reloads or closes.
 * "Remember on this device", Forget-everywhere and the per-provider settings
 * are #1930, which implements this same interface over its own storage, so
 * the transport and the settings field don't change when it lands.
 *
 * Keys never go anywhere from here: not into a URL, analytics, Sentry, a
 * transcript or any Bldrs endpoint. The only reader is the transport, which
 * sends a key to its own provider.
 */
export interface KeyStore {
  /** The key for a provider id (e.g. 'openrouter'), or null without one. */
  get(provider: string): string | null
  /** Set the key; an empty or blank key forgets it. */
  set(provider: string, key: string): void
  forget(provider: string): void
  /** Called after any change; returns the unsubscribe. */
  subscribe(cb: () => void): () => void
}


/** The key-store id of the user's OpenRouter key (transport.ts). */
export const OPENROUTER_KEY_ID = 'openrouter'


/**
 * @return a key store over this tab's memory only
 */
export function createSessionKeyStore(): KeyStore {
  const keys = new Map<string, string>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((cb) => cb())
  const forget = (provider: string) => {
    if (keys.delete(provider)) {
      notify()
    }
  }
  return {
    get: (provider) => keys.get(provider) ?? null,
    set: (provider, key) => {
      const trimmed = key.trim()
      if (trimmed === '') {
        forget(provider)
        return
      }
      keys.set(provider, trimmed)
      notify()
    },
    forget,
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
