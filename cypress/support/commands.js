// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
import '@percy/cypress'
import '@testing-library/cypress/add-commands'
import 'cypress-react-router/add-commands'


/* eslint-disable no-empty-function */
/**
 * Allow access to elements inside iframe and chain commands from there.
 *
 * @see https://www.nicknish.co/blog/cypress-targeting-elements-inside-iframes
 */
Cypress.Commands.add('iframe', {prevSubject: 'element'}, ($iframe, callback = () => {}) => {
  return cy
      .wrap($iframe)
      .should((iframe) => expect(iframe.contents().find('body')).to.exist)
      .then((iframe) => cy.wrap(iframe.contents().find('body')))
      .within({}, callback)
})


Cypress.Commands.overwrite('percySnapshot', (label) => {
  const mobileWidth = 390
  const mobileHeight = 844
  const desktopWidth = 1280
  const desktopHeight = 1024
  return cy.viewport(mobileWidth, mobileHeight)
    .percySnapshot(label, {width: mobileWidth})
    .viewport(desktopWidth, desktopHeight)
    .percySnapshot({width: 1280})
})
