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
