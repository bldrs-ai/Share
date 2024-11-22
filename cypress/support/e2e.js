// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

import 'cypress-real-events/support'
import {rest} from 'msw'
import {initWorker} from '../../src/__mocks__/browser'
import './commands'

// Global worker across before/after calls
let worker


/** Called once before all testing */
before(() => {
  // Cypress catch-all to print all requests not caught by MSW
  cy.intercept('**', (req) => {
    const urlStr = `${req.url}`
    if (urlStr.includes('undefined')) {
      console.warn(`cypress/support/e2e#before catch-all: Found undefined in: ${req.method} ${req.url}`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`cypress/support/e2e#before catch-all: ${req.method} ${req.url}`)
    }
  }).as('debugRequests')

  // MSW init
  worker = initWorker({
    AUTH0_DOMAIN: Cypress.env('AUTH0_DOMAIN'),
    GITHUB_BASE_URL: Cypress.env('GITHUB_BASE_URL'),
    GITHUB_BASE_URL_UNAUTHENTICATED: Cypress.env('GITHUB_BASE_URL_UNAUTHENTICATED'),
    MSW_IS_ENABLED: Cypress.env('MSW_IS_ENABLED'),
    OAUTH2_CLIENT_ID: Cypress.env('OAUTH2_CLIENT_ID'),
    RAW_GIT_PROXY_URL: Cypress.env('RAW_GIT_PROXY_URL'),
    RAW_GIT_PROXY_URL_NEW: Cypress.env('RAW_GIT_PROXY_URL_NEW'),
  })
  worker.start({
    onUnhandledRequest: 'warn',
  })
  worker.printHandlers()

  // MSW catch-all to print all
  worker.use(
    rest.all('*', (req, res, ctx) => {
      const urlStr = `${req.url}`
      if (urlStr.includes('undefined')) {
        cy.task('log', `cypress/support/e2e#before MSW catch-all: Found undefined in: ${req.method} ${req.url}`)
      }
      return req.passthrough() // Allow the request to continue
    }),
  )
})


/** Called once after all testing */
after(() => {
  worker.stop() // Stop the MSW worker after tests
})
