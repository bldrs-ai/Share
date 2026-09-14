// Revoke on a later task; see the call site below.
const REVOKE_DELAY_MS = 1000


/**
 * Hand a Blob to the browser as a file download.
 *
 * Isolated in its own module because it is the one step of an export that
 * can't be asserted from its return value — it works by side effect on the
 * document — so tests stub or inspect it here rather than reaching into the
 * hook.
 *
 * Safari ≤ 16 ignores `download` on a blob: URL in some configurations and
 * opens the file inline instead; that is on the cross-browser smoke
 * checklist (design/new/glb-export-premium.md §8), with `window.open` as
 * the fallback if it bites.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  // Firefox only dispatches the download for a link that is in the document.
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on a later task, not inline: the download is started
  // asynchronously from the click, and revoking the URL in the same tick can
  // cancel it in Chromium.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
