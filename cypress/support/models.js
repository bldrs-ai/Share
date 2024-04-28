/**
 * Setup intercept for virtual paths in share.  There will also be an
 * interceptTag created for the bounce page as `${interceptTag}-bounce`
 *
 * @param {string} path Like /bldrs-ai/test-models/blob/main/step/gear.step.ifc
 * @param {string} tag Like 'loadGear'
 */
export function setupVirtualPathIntercept(path, fixturePath, interceptTag) {
  const sharePrefix = '/share/v/gh'
  if (!path.startsWith(sharePrefix)) {
    throw new Error(`Path must start with ${sharePrefix}`)
  }
  cy.intercept('GET', `${path}`, {fixture: '404.html'})
    .as(`${interceptTag}-bounce`)
  const ghPath = path.substring(sharePrefix.length)
  cy.intercept('GET', `https://rawgit.bldrs.dev.msw/r${ghPath}`, {fixture: fixturePath})
    .as(interceptTag)
}


/** @param {string} tag Like 'loadMomentum' */
export function waitForModelReady(tag) {
  cy.wait(`@${tag}`)
  // TODO(pablo): same as index.ifc load
  cy.get('[data-model-ready="true"]').should('exist', {timeout: 1000})
  const animWaitTimeMs = 1000
  // eslint-disable-next-line cypress/no-unnecessary-waiting
  cy.wait(animWaitTimeMs)
}
