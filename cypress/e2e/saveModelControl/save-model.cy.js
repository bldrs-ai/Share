describe('save model', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      cy.window.Cypress = true
      // cy.routerNavigate('/share/v/p/index.ifc')
      cy.get('#viewer-container').get('canvas').should('be.visible')
      cy.get('[data-model-ready="true"]').should('exist')
    })

    it('should login', () => {
      /* cy.visit('/',  {timeout: 10000}).then((win) => {
          // Directly create a stub on the window object for loginWithPopup
          cy.stub(win, 'loginWithPopup').callsFake((options) => {
            // Log or assert the appState to ensure it's being set correctly
            expect(options.appState.returnTo).to.equal(win.location.pathname);
            cy.log("in popup")
            return Promise.resolve({
              // Provide mock tokens and user data as needed
              accessToken: 'mockAccessToken',
              idToken: 'mockIdToken',
              user: { name: 'Mock User', email: 'mock@example.com' },
            });
          }).as('loginWithPopupStub'); // Naming the stub for later reference

          // Mock any other parts of the authentication process as necessary
          win.localStorage.setItem('accessToken', 'mockAccessToken');
          win.localStorage.setItem('idToken', 'mockIdToken');
        });*/

      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.get('[title="Users menu"]').click()
      cy.log('simulating login')
      cy.findByTestId('login-with-github').click()

      // Use the alias to ensure the stub was called
      // cy.get('@loginWithPopupStub').should('have.been.calledOnce');

      // cy.findByTestId('Save IFC', { timeout: 10000 }).should('exist');

      // Continue with any assertions or tests that rely on the user being logged in
    })
  })
})
