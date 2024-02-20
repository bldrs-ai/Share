import {rest} from 'msw'
import {
  MOCK_COMMENTS,
  MOCK_ISSUES,
  MOCK_ORGANIZATIONS,
  MOCK_REPOSITORY,
  MOCK_FILES,
  MOCK_COMMITS,
  MOCK_BRANCHES,
} from '../utils/GitHub'


const httpOk = 200
const httpCreated = 201
const httpAuthorizationRequired = 401
const httpNotFound = 404

/**
 * Initialize API handlers, including Google Analytics and GitHub.
 *
 * @return {Array<object>} handlers
 */
export function initHandlers() {
  const handlers = []
  handlers.push(...auth0Handlers())
  handlers.push(...githubHandlers())
  handlers.push(...gaHandlers())
  return handlers
}


/**
 * Mock to disable Google Analytics.
 *
 * @return {Array<object>} handlers
 */
function gaHandlers() {
  return [
    rest.get('https://www.google-analytics.com/*', (req, res, ctx) => {
      return res(
          ctx.status(httpOk),
          ctx.json({}),
      )
    }),
  ]
}

/**
 *
 * @return {Array} list of auth0 handlers
 */
function auth0Handlers() {
  return [
    // Mock for Auth0 Logout URL with a redirect response
    rest.get(
        'https://bldrs.us.auth0.com/v2/logout',
        (req, res, ctx) => {
          const clientId = req.url.searchParams.get('client_id')
          const auth0Client = req.url.searchParams.get('auth0Client')
          const HTTP_BAD_REQUEST = 400
          // Check for required query parameters
          if (!clientId || !auth0Client) {
            return res(
                ctx.status(HTTP_BAD_REQUEST),
                ctx.json({error: 'Missing parameters'}),
            )
          }

          const HTTP_REDIRECT = 302
          // Return a 302 Found response with a Location header for the redirect
          return res(
              ctx.status(HTTP_REDIRECT), // Use 302 Found status code for redirection
              ctx.set('Location', 'https://bldrs.ai/share'), // Set the Location header to the URL where the client should be redirected
              ctx.set('CF-Ray', '8581a053c8ce3b77-IAD'),
              ctx.set('CF-Cache-Status', 'DYNAMIC'),
              ctx.set('Cache-Control', 'no-store, max-age=0, no-transform'),
              ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'),
              ctx.set('Vary', 'Accept, Accept-Encoding'),
              ctx.set('Pragma', 'no-cache'),
              ctx.set('X-Auth0-RequestId', 'e623ebb9c257099ed80f'),
              ctx.set('X-Content-Type-Options', 'nosniff'),
              ctx.set('X-RateLimit-Limit', '100'),
              ctx.set('X-RateLimit-Remaining', '99'),
              ctx.set('X-RateLimit-Reset', '1708378387'),
              ctx.set('Server', 'cloudflare'),
              ctx.set('alt-svc', 'h3=":443"; ma=86400'),
              // The body can be a simple message or HTML content for browsers to display before redirecting
              ctx.text('<p>Found. Redirecting to <a href="https://bldrs.ai/share">https://bldrs.ai/share</a></p>'),
          )
        },
    ),

    rest.get('*', (req, res, ctx) => {
      // eslint-disable-next-line no-console
      console.log(`url: ${ req.url}`)
      // Notice no `return res()` statement
    }),

    rest.post('https://bldrs.us.auth0.com/oauth/token', (req, res, ctx) => {
      const STATUS_OK = 200
      return res(
          /* eslint-disable max-len */
          ctx.status(STATUS_OK),
          ctx.set({
            'Date': 'Tue, 20 Feb 2024 03:06:31 GMT',
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
            'Connection': 'keep-alive',
            'CF-Ray': '858388bb09b63879-IAD',
            'CF-Cache-Status': 'DYNAMIC',
            'Access-Control-Allow-Origin': 'http://localhost:8080',
            'Cache-Control': 'no-store',
            'Set-Cookie': 'did=s%3Av0%3A0c2c9ed0-cf9d-11ee-89ae-19acbf87a5ee.9EG3gLQUnF4f5e%2Fi8sXhmGBJhrowZV%2B8iiGpNpyhPEc; Max-Age=31557600; Path=/; Expires=Wed, 19 Feb 2025 09:06:31 GMT; HttpOnly; Secure; SameSite=None',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Vary': 'Accept-Encoding, Origin',
            'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
            'Pragma': 'no-cache',
            'X-Auth0-RequestId': '8a11370999d65d2b871c',
            'X-Content-Type-Options': 'nosniff',
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '99',
            'X-RateLimit-Reset': '1708398392',
            'Server': 'cloudflare',
            'Content-Encoding': 'br',
            'alt-svc': 'h3=":443"; ma=86400',
          }),
          ctx.json({
            access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InF2dFhNWGZBRDQ5Mmd6OG5nWmQ3TCJ9.eyJpc3MiOiJodHRwczovL2JsZHJzLnVzLmF1dGgwLmNvbS8iLCJzdWIiOiJnaXRodWJ8MTc0NDc2OTAiLCJhdWQiOlsiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS8iLCJodHRwczovL2JsZHJzLnVzLmF1dGgwLmNvbS91c2VyaW5mbyJdLCJpYXQiOjE3MDgzOTc4NjAsImV4cCI6MTcwODQ4NDI2MCwiYXpwIjoieG9qYmJTeUo5bjZIVWRad0U3TFVYN1Z2ZmY2ZWp4anYiLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIG9mZmxpbmVfYWNjZXNz',
            id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InF2dFhNWGZBRDQ5Mmd6OG5nWmQ3TCJ9.eyJuaWNrbmFtZSI6Im5pY2tjYXN0ZWw1MCIsIm5hbWUiOiJuaWNrY2FzdGVsNTBAZ21haWwuY29tIiwicGljdHVyZSI6Imh0dHBzOi8vYXZhdGFycy5naXRodWJ1c2VyY29udGVudC5jb20vdS8xNzQ0NzY5MD92PTQiLCJ1cGRhdGVkX2F0IjoiMjAyNC0wMi0yMFQwMjo1Nzo0MC4zMjRaIiwiZW1haWwiOiJuaWNrY2FzdGVsNTBAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOi8vYmxkcnMudXMuYXV0aDAuY29tLyIsImF1ZCI6InhvamJiU3lKOW42SFVkWndFN0xVWDdadmZmNmVqeGp2IiwiaWF0IjoxNzA4Mzk3ODYwLCJleHAiOjE3MDg0MzM4NjAsInN1YiI6ImdpdGh1YnwxNzQ0NzY5MCIsInNpZCI6ImxTY01QY01yUXh3UjZCN0hlZHg0cGVTVDQtZlVjMkZhIiwibm9uY2UiOiJVMVpQWDJsSlRHZFdZV3hGZG1sV1VISk9Na2hHU1RaYVkydFFjSEZDTjJSNlIxVXlWREZuUVVkWGJ3PT0ifQ.otfuWiLuQlJz9d0uX2AOf4IFX4LxS-Vsq_Jt5YkDF98qCY3qQHBaiXnlyOoczjcZ3Zw9Ojq-NlUP27up-yqDJ1_RJ7Kiw6LV9CeDAytNvVdSXEUYJRRwuBDadDMfgNEA42y0M29JYOL_ArPUVSGt9PWFKUmKdobxqwdqwMflFnw3ypKAATVapagfOoAmgjCs3Z9pOgW-Vm1bb3RiundtgCAPNKg__brz0pyW1GjKVeUaoTN9LH8d9ifiq2mOWYvglpltt7sB596CCNe15i3YeFSQoUxKOpCb0kkd8oR_-dUtExJrWvK6kEL6ibYFCU659-qQkoI4r08h_L6cDFm62A',
            scope: 'openid profile email offline_access',
            expires_in: 86400,
            token_type: 'Bearer',
          }),
          /* eslint-enable max-len */
      )
    }),

    // Mock for Auth0 Authorize URL with a redirect response
    /* rest.get(/https:\/\/bldrs\.us\.auth0\.com\/authorize(\?.+)?$/,
        (req, res, ctx) => {
        // Extract query parameters from the request
          const clientId = req.url.searchParams.get('client_id')
          const scope = req.url.searchParams.get('scope')
          const audience = req.url.searchParams.get('audience')
          // Add other required parameters as needed
          const HTTP_BAD_REQUEST = 400

          // You could add validation or logic based on query parameters here
          if (!clientId || !scope || !audience) {
            return res(
                ctx.status(HTTP_BAD_REQUEST),
                ctx.json({error: 'Missing required query parameters'}),
            )
          }

          // Simulate the redirect to the login page
          const redirectUrl = `/u/login?state=teststate`
          const HTTP_REDIRECT = 302
          return res(
              ctx.status(HTTP_REDIRECT),
              ctx.set('Location', redirectUrl),
              // Include other headers as per the provided response example
              ctx.set('CF-Ray', '8581bad27db5422f-EWR'),
              ctx.set('Cache-Control', 'no-store, max-age=0, no-transform'),
              ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'),
              ctx.set('X-Auth0-RequestId', '60888b053237756f7f1d'),
              // etc...
              ctx.text(`<p>Found. TEST Redirecting to <a href="${redirectUrl}">${redirectUrl}</a></p>`),
          )
        },
    ),*/
  ]
}


/**
 * Static stubs GitHub orgs, repos, issues.
 *
 * @return {Array<object>} handlers
 */
function githubHandlers() {
  return [
    rest.get('https://api.github.com/repos/:org/:repo/issues', (req, res, ctx) => {
      const {org, repo} = req.params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share') {
        return res(ctx.status(httpNotFound))
      }

      return res(
          ctx.status(httpOk),
          ctx.json(MOCK_ISSUES.data),
      )
    }),

    rest.get('https://api.github.com/repos/:org/:repo/issues/:issueNumber/comments', (req, res, ctx) => {
      const {org, repo, issueNumber} = req.params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return res(ctx.status(httpNotFound))
      }

      return res(
          ctx.status(httpOk),
          ctx.json(MOCK_COMMENTS.data),
      )
    }),

    rest.get('https://api.github.com/repos/:org/:repo/contents/:path', (req, res, ctx) => {
      const {org, repo, path} = req.params
      const ref = req.url.searchParams.get('ref')

      if (org !== 'bldrs-ai' || repo !== 'Share' || path !== 'README.md') {
        return res(
            ctx.status(httpNotFound),
            ctx.json({
              message: 'Not Found',
              documentation_url: 'https://docs.github.com/rest/reference/repos#get-repository-content',
            }),
        )
      }

      let downloadURL = 'https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md'

      if (ref === 'main') {
        downloadURL += '?token=MAINBRANCHCONTENT'
      } else if (ref === 'a-new-branch') {
        downloadURL += '?token=TESTTOKENFORNEWBRANCH'
      }

      return res(
          ctx.status(httpOk),
          ctx.set({
            'content-type': 'application/json; charset=utf-8',
          }),
          ctx.json({
            name: 'README.md',
            path: 'README.md',
            sha: 'a5dd511780350dfbf2374196d8f069114a7d9205',
            size: 1359,
            url: 'https://api.github.com/repos/bldrs-ai/Share/contents/README.md?ref=main',
            html_url: 'https://github.com/bldrs-ai/Share/blob/main/README.md',
            git_url: 'https://api.github.com/repos/bldrs-ai/Share/git/blobs/a5dd511780350dfbf2374196d8f069114a7d9205',
            download_url: downloadURL,
            type: 'file',
            content: 'U2hhcmUgaXMgYSB3ZWItYmFzZWQgQklNICYgQ0FEIGludGVncmF0aW9uIGVu\n' +
              'dmlyb25tZW50IGZyb20gW2JsZHJzLmFpXShodHRwczovL2JsZHJzLmFpLyku\n' +
              'CgotICpPcGVuKiBhbnkgSUZDIG1vZGVsIG9uIGdpdGh1YiBieSBwYXN0aW5n\n' +
              'IGludG8gdGhlIHNlYXJjaGJhciwgb3IgdXBsb2FkaW5nIGZyb20geW91ciBs\n' +
              'b2NhbCBkZXNrdG9wLgotICpWaWV3KiB0aGUgbW9kZWwsICpuYXZpZ2F0ZSog\n' +
              'aXRzIHN0cnVjdHVyZSBhbmQgdXNlICpjdXQgcGxhbmVzKiB0byB2aWV3IGlu\n' +
              'c2lkZS4KLSAqU2VhcmNoKiB0aGUgbW9kZWwncyBlbGVtZW50cyBhbmQgcHJv\n' +
              'cGVydGllcy4KLSAqQ29sbGFib3JhdGUqIHdpdGggdGVhbW1hdGVzIGJ5IGNv\n' +
              'bW1lbnRpbmcgb24gbW9kZWwgcGFydHMgYW5kIHByb3BlcnRpZXMgKGluIGRl\n' +
              'dmVsb3BtZW50KS4KLSAqU2hhcmUqIHdpdGggdGVhbW1hdGVzLCB1c2luZyBw\n' +
              'ZXJtYWxpbmtzIHRvIG1vZGVsIHBhcnRzIHdpdGggZXhhY3QgY2FtZXJhIHZp\n' +
              'ZXdzLgotICpFeHRlbmQqIG91ciBwbGF0Zm9ybSB3aXRoIHlvdXIgQXBwcy4g\n' +
              'KGluIGRldmVsb3BtZW50KQoKIVtpbWFnZV0oaHR0cHM6Ly91c2VyLWltYWdl\n' +
              'cy5naXRodWJ1c2VyY29udGVudC5jb20vMjQ4MDg3OS8xNzM1NDg3ODUtYzYx\n' +
              'YWM5NzYtNzUxZS00YTFmLWJhMjgtMTUxNGI0NGQ1MzllLnBuZykKCiMgQ29u\n' +
              'dHJpYnV0aW5nClBsZWFzZSBqb2luIGluIGNyZWF0aW5nIEJsZHJzISAgQ29t\n' +
              'ZSBjaGF0IHdpdGggdXMgYXQgdGhlIFtCbGRycyBEaXNjb3JkXShodHRwczov\n' +
              'L2Rpc2NvcmQuZ2cvYXBXSGZEdGtKcykuCgpJZiB5b3UgaGF2ZSBpZGVhcyBv\n' +
              'ciBpc3N1ZXMsIHBsZWFzZSBmaWxlIHRoZW0gaW4gb3VyIEdpdEh1YiBbaXNz\n' +
              'dWVzXShodHRwczovL2dpdGh1Yi5jb20vYmxkcnMtYWkvU2hhcmUvaXNzdWVz\n' +
              'KSBwYWdlLCBvciBtYWlsIGluZm9AYmxkcnMuYWkuCgojIyBEb25hdGlvbnMg\n' +
              'CklmIHlvdSB1c2UgQmxkcnMgZm9yIHByaXZhdGUgaG9zdGluZywgcGxlYXNl\n' +
              'IGNvbnRyaWJ1dGUgdG8gdGhlIFtCbGRycyBPcGVuIENvbGxlY3RpdmUgcHJv\n' +
              'amVjdF0oaHR0cHM6Ly9vcGVuY29sbGVjdGl2ZS5jb20vYmxkcnMpLgoKIyMg\n' +
              'RGV2ZWxvcG1lbnQKQmxkcnMgaXMgb3BlbiBzb3VyY2UgYW5kIHdlJ2QgYXBw\n' +
              'cmVjaWF0ZSB5b3VyIGhlbHAuCi0gW1Byb2plY3RzXShodHRwczovL2dpdGh1\n' +
              'Yi5jb20vb3Jncy9ibGRycy1haS9wcm9qZWN0cz9xdWVyeT1pcyUzQW9wZW4m\n' +
              'dHlwZT1iZXRhKQotIFtEZXNpZ24gRG9jXShodHRwczovL2dpdGh1Yi5jb20v\n' +
              'YmxkcnMtYWkvU2hhcmUvd2lraS9EZXNpZ24pCi0gW0RldmVsb3BlciBHdWlk\n' +
              'ZV0oaHR0cHM6Ly9naXRodWIuY29tL2JsZHJzLWFpL1NoYXJlL3dpa2kvRGV2\n' +
              'Oi1HdWlkZSkK\n',
            encoding: 'base64',
            links: {
              self: 'https://api.github.com/repos/bldrs-ai/Share/contents/README.md?ref=main',
              git: 'https://api.github.com/repos/bldrs-ai/Share/git/blobs/a5dd511780350dfbf2374196d8f069114a7d9205',
              html: 'https://github.com/bldrs-ai/Share/blob/main/README.md',
            },
          }),
      )
    }),

    rest.post('https://api.github.com/repos/:org/:repo/issues', (req, res, ctx) => {
      const {org, repo} = req.params

      if (org !== 'bldrs-ai' || repo !== 'Share') {
        return res(
            ctx.status(httpNotFound),
            ctx.json({
              message: 'Not Found',
            }),
        )
      }

      return res(
          ctx.status(httpCreated),
      )
    }),

    rest.post('https://api.github.com/repos/:org/:repo/issues/:issueNumber/comments', (req, res, ctx) => {
      const {org, repo, issueNumber} = req.params

      if (org !== 'bldrs-ai' || repo !== 'Share' || !issueNumber) {
        return res(ctx.status(httpNotFound))
      }

      return res(
          ctx.status(httpCreated),
      )
    }),

    rest.patch('https://api.github.com/repos/:org/:repo/issues/:issueNumber', (req, res, ctx) => {
      const {org, repo} = req.params
      if (org !== 'pablo-mayrgundter' || repo !== 'Share' ) {
        return res(
            ctx.status(httpNotFound),
            ctx.json({
              message: 'Not Found',
            }),
        )
      }

      return res(
          ctx.status(httpOk),
      )
    }),

    rest.delete('https://api.github.com/repos/:org/:repo/issues/comments/:commentId', (req, res, ctx) => {
      const {org, repo, commentId} = req.params

      if (org !== 'bldrs-ai' || repo !== 'Share' || !commentId) {
        return res(ctx.status(httpNotFound))
      }

      return res(
          ctx.status(httpOk),
      )
    }),

    rest.get('https://api.github.com/user/orgs', (req, res, ctx) => {
      const authHeader = req.headers.get('authorization')

      if (!authHeader) {
        return res(
            ctx.status(httpAuthorizationRequired),
            ctx.json({
              message: 'Requires authentication',
              documentation_url: 'https://docs.github.com/rest/reference/orgs#list-organizations-for-the-authenticated-user',
            }),
        )
      }

      return res(
          ctx.status(httpOk),
          ctx.json(MOCK_ORGANIZATIONS.data),
      )
    }),

    rest.get('https://api.github.com/orgs/bldrs-ai/repos', (req, res, ctx) => {
      return res(
          ctx.status(httpOk),
          ctx.json({
            data: [MOCK_REPOSITORY],
          }),
      )
    }),

    rest.get('https://api.github.com/repos/:owner/:repo/contents', (req, res, ctx) => {
      return res(
          ctx.status(httpOk),
          ctx.json(MOCK_FILES),
      )
    }),

    rest.get(
        'https://api.github.com/repos/:owner/:repo/commits',
        (req, res, ctx) => {
          return res(
              ctx.status(httpOk),
              ctx.json(MOCK_COMMITS),
          )
        }),

    rest.get(
        'https://api.github.com/repos/:owner/:repo/branches',
        (req, res, ctx) => {
          return res(
              ctx.status(httpOk),
              ctx.json(MOCK_BRANCHES),
          )
        }),

    // octokit.rest.git.getlatestCommitHash
    rest.get(
        'https://api.github.com/repos/:owner/:repo/commits',
        (req, res, ctx) => {
          return res(
              ctx.status(httpOk),
              ctx.json([{sha: 'testsha'}]),
          )
        }),

    /* Begin support for GitHub commitFile.  HTTP_BAD_REQUEST(400) is
     * used to indicate missing args, tho we're not sure what actual
     * GH returns for the various cases. */

    // octokit.rest.git.getRef
    rest.get('https://api.github.com/repos/:owner/:repo/git/ref/:ref', (req, res, ctx) => {
      return res(
          ctx.status(httpOk),
          ctx.json({object: {sha: 'parentSha'}}),
      )
    }),

    // octokit.rest.git.getCommit
    rest.get(
        'https://api.github.com/repos/:owner/:repo/git/commits/:commit_sha',
        (req, res, ctx) => {
          return res(
              ctx.status(httpOk),
              ctx.json({tree: {sha: 'treeSha'}}),
          )
        }),

    // octokit.rest.git.createBlob
    rest.post(
        'https://api.github.com/repos/:owner/:repo/git/blobs',
        async (req, res, ctx) => {
          const {content, encoding} = await req.body
          if (content === undefined || encoding === undefined) {
            const HTTP_BAD_REQUEST = 400
            return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
          }
          return res(
              ctx.status(httpOk),
              ctx.json({sha: 'blobSha'}),
          )
        }),

    // octokit.rest.git.createTree
    rest.post(
        'https://api.github.com/repos/:owner/:repo/git/trees',
        async (req, res, ctx) => {
          // eslint-disable-next-line camelcase
          const {base_tree, tree} = await req.body
          // eslint-disable-next-line camelcase
          if (base_tree === undefined || tree === undefined) {
            const HTTP_BAD_REQUEST = 400
            return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
          }
          return res(
              ctx.status(httpOk),
              ctx.json({sha: 'newTreeSha'}),
          )
        }),

    // octokit.rest.git.createCommit
    rest.post(
        'https://api.github.com/repos/:owner/:repo/git/commits',
        async (req, res, ctx) => {
          const {message, tree, parents} = await req.body
          if (message === undefined || tree === undefined || parents === undefined) {
            const HTTP_BAD_REQUEST = 400
            return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
          }
          return res(
              ctx.status(httpOk),
              ctx.json({sha: 'newCommitSha'}),
          )
        }),

    // octokit.rest.git.updateRef
    rest.patch(
        'https://api.github.com/repos/:owner/:repo/git/refs/:ref',
        async (req, res, ctx) => {
          const {sha} = await req.body
          if (sha === undefined) {
            const HTTP_BAD_REQUEST = 400
            return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
          }
          return res(
              ctx.status(httpOk),
              ctx.json({sha: 'smth'}),
          )
        }),
  ]
}
