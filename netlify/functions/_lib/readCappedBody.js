/*
 * Read a request's body as UTF-8 text, counting BYTES as they arrive and
 * stopping at a cap.
 *
 * `req.text()` buffers the whole body before a caller can measure it, so a
 * chunked request (no Content-Length to refuse it by) makes the function
 * hold whatever the platform lets through, and a length check on the decoded
 * string counts UTF-16 code units, not the bytes the cap is about: a body of
 * multibyte text can be under the cap in characters and well over it in
 * bytes (Codex on #2313). This reads the stream itself and cancels it the
 * moment the count crosses the cap.
 *
 * A Content-Length over the cap should still be refused before calling this,
 * so an honest oversized post costs no read at all.
 *
 * `ai-chat.js#readRequestBody` still reads with `req.text()` and measures
 * after; it could move to this.
 *
 * Dependency-free plain Node ESM, like the rest of `_lib/`.
 */


/**
 * @param {Request} req
 * @param {number} maxBytes
 * @return {Promise<{text: string}|{tooLarge: true}|{unreadable: true}>}
 */
export async function readCappedText(req, maxBytes) {
  if (req.body === null) {
    return {text: ''}
  }
  const reader = req.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) {
        break
      }
      bytes += value.byteLength
      if (bytes > maxBytes) {
        // Stop the sender; what's held so far is dropped with `chunks`.
        await reader.cancel().catch(() => undefined)
        return {tooLarge: true}
      }
      chunks.push(value)
    }
  } catch {
    return {unreadable: true}
  }
  const all = new Uint8Array(bytes)
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.byteLength
  }
  return {text: new TextDecoder().decode(all)}
}
