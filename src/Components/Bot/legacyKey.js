/**
 * The prototype bot chat kept the user's OpenRouter key here, in plain text
 * and forever (ai-workspace.md D13). The assistant now keeps keys in tab
 * memory only (assist/keyStore.ts), so this name is read once, at startup,
 * to delete it: a key saved by the old chat doesn't outlive it on the
 * device, whether or not the assistant is ever opened again. Its own module,
 * free of imports, so `index.jsx` can call it without pulling in anything.
 */
export const LEGACY_KEY_NAME = 'openrouter_api_key'


/** Delete the plaintext key the old chat saved, if any. */
export function forgetLegacyKey() {
  try {
    localStorage.removeItem(LEGACY_KEY_NAME)
  } catch {
    // Storage blocked (private mode, sandboxed frame): nothing was saved there.
  }
}
