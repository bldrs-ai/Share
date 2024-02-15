describe('notes', () => {
  context('notes interactions in the side drawer', () => {
    beforeEach(() => {
      cy.clearCookies()
      cy.visit('/')
      cy.get('.MuiIconButton-root').click()
      cy.get('[data-testid="Notes"]').click()
    })
    it('should display Notes navbar title', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
    it('should navigate to create notes when add a note button is clicked', () => {
      cy.get('[data-testid="Add a note"]').click()
      cy.get('[data-testid="panelTitle"]').contains('ADD A NOTE')
    })
    it('should navigate back to the notes list', () => {
      cy.get('[data-testid="Add a note"]').click()
      cy.get('[data-testid="panelTitle"]').contains('ADD A NOTE')
      cy.get('[data-testid="Back to the list"]').click()
      cy.get('.MuiList-root')
    })
  })
  // context('note card elements', () => {
  //   beforeEach(() => {
  //     cy.clearCookies()
  //     cy.visit('/')
  //     cy.get('.MuiIconButton-root').click()
  //     cy.get('[data-testid="Notes"]', {timeout: 10000}).should('be.visible')
  //     cy.get('[data-testid="Notes"]').click({force: true})
  //   })
  //   it('should display notes list', () => {
  //     cy.get('.MuiList-root')
  //   })
  //   it('should display note body', () => {
  //     cy.get('.MuiList-root')
  //     cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Test Issue body')
  //   })
  //   it('a note should contain github link button', () => {
  //     cy.get('.MuiList-root')
  //     cy.get(':nth-child(1) > .css-24km69 > .css-1yae3jf > [data-testid="Open in Github"]')
  //   })
  //   it('a note should contain discussion button ', () => {
  //     cy.get('.MuiList-root')
  //     cy.get('[data-testid="Discussion"]')
  //   })
  // })
  // context('note card interactions', () => {
  //   beforeEach(() => {
  //     cy.clearCookies()
  //     cy.visit('/')
  //     cy.get('.MuiIconButton-root').click()
  //     cy.get('[data-testid="Notes"]', {timeout: 10000}).should('be.visible')
  //     cy.get('[data-testid="Notes"]').click({force: true})
  //     cy.get(':nth-child(2) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').click()
  //   })
  //   it('navbar should change to a note view when a note is selected', () => {
  //     cy.get('.css-13e0tv1 > .css-hb3iqx > .css-95g4uk > .MuiTypography-root').contains('NOTE')
  //   })
  //   it('url should be copied to a clipboard when the note is shared', () => {
  //     cy.get('.css-1yae3jf > [data-testid="Share"]').click()
  //     cy.get('.MuiSnackbarContent-message > div')
  //   })
  //   it('comment should be displayed when a note is selected', () => {
  //     cy.get(':nth-child(2) > .MuiCardContent-root > p').contains('Test Comment 1')
  //   })
  //   it('notes should change when previous and next nav buttons are clicked', () => {
  //     cy.get('[data-testid="Previous Note"]').click()
  //     cy.get('.MuiList-root > :nth-child(1) > .MuiCardContent-root > p').contains('Test Issue body')
  //     cy.get('[data-testid="Next Note"]').click()
  //     cy.get('.MuiCardHeader-title').contains('Local issue - some text is here to test')
  //   })
  // })
})

