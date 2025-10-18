let port = 0
let nonce = ''


/** Clears local storage and cookies */
export function clearState() {
  cy.clearLocalStorage()
  cy.clearCookies()
}


/**
 * Intercept load of index.ifc to attach an @loadModel event to it.  index.ifc
 * isn't accessed directly by UX, but is implicitly loaded by
 * /share/v/p/index.ifc virtual path
 */
export function interceptIndex() {
  cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
}


/**
 * Intercept load of virtual project path to index.ifc to serve up 404 bounce
 * page.  Also registers @bounce event for wait
 */
export function interceptBounce() {
  cy.intercept('GET', '/share/v/p/index.ifc', {fixture: '404.html'}).as('bounce')
  // For view-100/synchronized-view-and-navtree.cy.js
  cy.intercept('GET', '/share/v/p/index.ifc/*', {fixture: '404.html'}).as('bounceEltSelect')
  cy.intercept('GET', '/share/v/p/index.ifc?*', {fixture: '404.html'}).as('bounceSearch')
}


/** Setup initial homepage intercepts */
export function interceptInitialLoads() {
  interceptIndex()
  interceptBounce()
}


/** Clears local storage and cookies, and setup initial homepage intercepts */
export function homepageSetup() {
  clearState()
  interceptInitialLoads()
}


/** Sets state for returning user and visit homepage */
export function returningUserVisitsHomepage() {
  setIsReturningUser()
  visitHomepage()
}


/** Same as returningUserVisitsHomepage, but waitForModel too */
export function returningUserVisitsHomepageWaitForModel() {
  returningUserVisitsHomepage()
  waitForModel()
}


/** Set cookie indicating user has visited before */
export function setIsReturningUser() {
  cy.setCookie('isFirstTime', '1')
}


/** Visit root path.  This will trigger an autoload to /share/v/p/index.ifc */
export function visitHomepage() {
  cy.visit('/')
}


/** Assumes other setup, then visit homepage and wait for model */
export function visitHomepageWaitForModel() {
  visitHomepage()
  waitForModel()
}


/**
 * Waits for a 3D model to load and become visible within the viewer.
 * It checks for the presence of the model canvas and a specific attribute
 * indicating the model is ready. Requires the setup of a network request
 * intercept with alias 'loadModel' for model loading.
 */
export function waitForModel() {
  cy.get('#viewer-container').get('canvas').should('be.visible')
  const HTTP_OK = 200
  const HTTP_NOT_MODIFIED = 304 // ie it's cached
  cy.wait('@loadModel').its('response.statusCode').should((statusCode) => {
    expect([HTTP_OK, HTTP_NOT_MODIFIED]).to.include(statusCode)
  })
  cy.get('[data-model-ready="true"]').should('exist', {timeout: 1000})
  const animWaitTimeMs = 1000
  // eslint-disable-next-line cypress/no-unnecessary-waiting
  cy.wait(animWaitTimeMs)
  // TODO(pablo): ideally we just wait on anim rest event from
  // camera-controls lib, but only seems to work locally.
  // cy.get('[data-is-camera-at-rest="true"]').should('exist', {timeout: 1000})
}


/**
 * Performs a simulated login using Auth0 by interacting with the UI elements related to
 * the login process.
 */
export function auth0Login(connection = 'github') {
  cy.get('[data-testid="control-button-profile"]').click()
  cy.log('simulating login')

  cy.get('[data-testid="menu-open-login-dialog"]').click()

  if (connection === 'github') {
    cy.get('[data-testid="login-with-github"]').click()
  } else {
    cy.get('[data-testid="login-with-google"]').click()
  }
  cy.contains('span', 'Log out').should('exist')
  cy.get('[data-testid="control-button-profile"]').realClick()
}


/**
 * Sets a new value for the global `port` variable. This function is
 * intended to dynamically update the port number used throughout the
 * testing suite, affecting how certain operations, such as network
 * requests, are handled.
 *
 * @param {number} newPort - The new port number to be set.
 */
export function setPort(newPort) {
  port = newPort
}

/**
 * Retrieves the current value of the global `port` variable, which is
 * used throughout the testing suite to specify the port number for network
 * requests or server interactions. This function complements `setPort` by
 * providing read access to the port value that `setPort` modifies.
 *
 * @return {number} The current value of the global `port` variable.
 */
export function getPort() {
  return port
}

/**
 * Base64 encode a payload object
 *
 * @param {*} payload
 * @return {string} base64 encoded string
 */
export function base64EncodePayload(payload) {
  // Convert the payload object to a JSON string
  const jsonString = JSON.stringify(payload)
  // Convert the JSON string to a Base64Url encoded string
  const base64UrlString = btoa(jsonString)
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, '') // Remove trailing '='
  return base64UrlString
}

/**
 * Sets up Cypress network request intercepts for handling authentication.
 * This includes intercepting authentication and token exchange requests to
 * mock against authentication flows.
 *
 * This function should be called before executing test cases that require
 * authentication, ensuring that the necessary intercepts are in place to
 * handle the authentication flow.
 */
export function setupAuthenticationIntercepts() {
  // Intercept the /authorize request
  cy.intercept('GET', '**/authorize*', (req) => {
    // Access query parameters
    const url = new URL(req.url)
    const queryParams = new URLSearchParams(url.search)

    // Extract the 'nonce' and 'state' parameters
    nonce = queryParams.get('nonce')
    const state = queryParams.get('state')

    // eslint-disable-next-line no-console
    console.log('[CYPRESS] 200 **/authorize', req.url)

    // Send back modified response
    req.reply({
      statusCode: 200,
      body:
      `
<!DOCTYPE html>
<html>
  <head><title>Authorization Response</title></head>
  <body>
    <script type="text/javascript">
      (function(window, document) {
        debugger;
        var targetOrigin = "http://localhost:${port}";
        var webMessageRequest = {};
        var authorizationResponse = {
          type: "authorization_response",
          response: {
            "code":"MMHHFcQ1bA-CrsFi6ctzt4wLc-aIljuJbdUyijNOdmtbE",
            "state":"${state}"
          }
        };
        var mainWin = (window.opener) ? window.opener : window.parent;
        if (webMessageRequest["web_message_uri"] && webMessageRequest["web_message_target"]) {
          window.addEventListener("message", function(evt) {
            switch (evt.data.type) {
              case "relay_response":
                var messageTargetWindow = evt.source.frames[webMessageRequest["web_message_target"]];
                if (messageTargetWindow) {
                  messageTargetWindow.postMessage(authorizationResponse, webMessageRequest["web_message_uri"]);
                  window.close();
                }
                break;
            }
          });
          mainWin.postMessage({type: "relay_request"}, targetOrigin);
        } else {
          mainWin.postMessage(authorizationResponse, targetOrigin);
        }
      })(this, this.document);
    </script>
  </body>
</html>
`,
    })
  }).as('authorizeRequest')

  // Intercept the /authorize request
  cy.intercept('POST', '**/oauth/token*', (req) => {
    // Update the iat and exp values
    // eslint-disable-next-line no-magic-numbers
    const currentTimeInSeconds = Math.floor(Date.now() / 1000)
    const DAY = 86400
    const iat = currentTimeInSeconds
    // Add 24 hours
    const exp = currentTimeInSeconds + DAY

    const payload = {
      nickname: 'cypresstester',
      name: 'cypresstest@bldrs.ai',
      picture: 'https://avatars.githubusercontent.com/u/17447690?v=4',
      updated_at: '2024-02-20T02:57:40.324Z',
      email: 'cypresstest@bldrs.ai',
      email_verified: true,
      iss: 'https://bldrs.us.auth0.com.msw/',
      aud: 'cypresstestaudience',
      iat: iat,
      exp: exp,
      sub: 'github|11111111',
      sid: 'cypresssession-abcdef',
      nonce: nonce,
    }

    // Encode the updated payload
    const encodedPayload = base64EncodePayload(payload)

    // eslint-disable-next-line no-console
    console.log('[CYPRESS] 200 **/oauth/token*', req.url)

    // Send back modified response
    req.reply({
      statusCode: 200,
      body:
       {
         access_token: 'testaccesstoken',
         id_token: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InF2dFhNWGZBRDQ5Mmd6OG5nWmQ3TCJ9.
         ${ encodedPayload }.
         otfuWiLuQlJz9d0uX2AOf4IFX4LxS-Vsq_Jt5YkDF98qCY3qQHBaiXnlyOoczjcZ3Zw9Ojq-NlUP27up-yqDJ1
         _RJ7Kiw6LV9CeDAytNvVdSXEUYJRRwuBDadDMfgNEA42y0M29JYOL_ArPUVSGt9PWFKUmKdobxqwdqwMflFnw3
         ypKAATVapagfOoAmgjCs3Z9pOgW-Vm1bb3RiundtgCAPNKg__brz0pyW1GjKVeUaoTN9LH8d9ifiq2mOWYvglp
         ltt7sB596CCNe15i3YeFSQoUxKOpCb0kkd8oR_-dUtExJrWvK6kEL6ibYFCU659-qQkoI4r08h_L6cDFm62A`,
         scope: 'openid profile email offline_access',
         expires_in: 86400,
         token_type: 'Bearer',
       },
    })
  }).as('tokenRequest')
}
