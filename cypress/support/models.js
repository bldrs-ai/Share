
/**
 * Setup intercept proxy access as @loadMomentum for:
 *
 *   https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc
 *
 * @param {string} tag Like 'loadMomentum'
 */
export function setupInterceptForGhModel(tag) {
  cy.intercept(
    'GET',
    'https://rawgit.bldrs.dev.msw/r/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
    {fixture: '/Momentum.ifc'},
  )
    .as(tag)
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
