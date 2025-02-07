/** Add listener for page reload approval */
export function enablePageReloadApprovalCheck() {
  window.addEventListener('beforeunload', handleBeforeUnload)
}


/** Clear previously listener for page reload approval */
export function disablePageReloadApprovalCheck() {
  window.removeEventListener('beforeunload', handleBeforeUnload)
}


/**
 * Prevent reloading page without user approval
 *
 * @param {Event} e
 * @return {void}
 * @deprecated Use the above functions
 */
export function handleBeforeUnload(e) {
  (e || window.event).returnValue = true
}


/** Disable text select for whole document, e.g. during a drag operation. */
export function disablePageTextSelect() {
  document.body.classList.add('no-select')
}


/** Re-enable text select for whole document after a drag. */
export function reenablePageTextSelect() {
  document.body.classList.remove('no-select')
}
