/**
 * Prevent reloading page without user approval
 *
 * @param {Event} e
 * @return {void}
 */
export function handleBeforeUnload(e) {
  (e || window.event).returnValue = true
}
