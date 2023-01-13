/**
 * Prevent reloading page without user approval
 *
 * @param {Event} e
 * @return {string}
 */
export function handleBeforeUnload(e) {
  const confirmationMessage = 'Uploaded models are not saved. If you leave this page you will need to upload the model again.';
  (e || window.event).returnValue = confirmationMessage // Gecko + IE
  return confirmationMessage // Gecko + Webkit, Safari, Chrome etc.
}
