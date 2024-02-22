
/**
 * Base64 encode a payload object
 *
 * @param {*} payload
 * @return {string} base64 encoded string
 */
function base64EncodePayload(payload) {
  // Convert the payload object to a JSON string
  const jsonString = JSON.stringify(payload)
  // Convert the JSON string to a Base64Url encoded string
  const base64UrlString = btoa(jsonString)
      .replace(/\+/g, '-') // Convert '+' to '-'
      .replace(/\//g, '_') // Convert '/' to '_'
      .replace(/=+$/, '') // Remove trailing '='
  return base64UrlString
}

describe('save model', () => {
  context('when no model is loaded', () => {
    let port = 0
    let nonce = ''
    beforeEach(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')

      // Intercept the /authorize request
      cy.intercept('GET', '**/authorize*', (req) => {
        // Access query parameters
        const url = new URL(req.url)
        const queryParams = new URLSearchParams(url.search)

        // Extract the 'nonce' and 'state' parameters
        nonce = queryParams.get('nonce')
        const state = queryParams.get('state')

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
          iss: 'https://null/',
          aud: 'cypresstestaudience',
          iat: iat,
          exp: exp,
          sub: 'github|11111111',
          sid: 'cypresssession-abcdef',
          nonce: nonce,
        }

        // Encode the updated payload
        const encodedPayload = base64EncodePayload(payload)

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
    })

    it('should only find Save IFC button after login', () => {
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const STATUS_OK = 200
        const url = new URL(currentUrl)
        port = url.port
        cy.findByTestId('Save IFC', {timeout: 10000}).should('not.exist')
        cy.log(`The current port is: ${port}`)
        // Need to figure out why a force is required here on GHA
        cy.get('[title="Users menu"]').click({force: true})
        cy.log('simulating login')
        cy.findByTestId('login-with-github').click()

        // Use the alias to ensure the intercept was called
        cy.wait('@authorizeRequest').its('response.statusCode').should('eq', STATUS_OK)
        cy.wait('@tokenRequest').its('response.statusCode').should('eq', STATUS_OK)

        cy.findByTestId('Save IFC', {timeout: 10000}).should('exist')
      })
    })
  })
})
