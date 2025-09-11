import {http, passthrough} from 'msw'
import {
  HTTP_AUTHORIZATION_REQUIRED,
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_NO_CONTENT,
  HTTP_OK,
} from '../net/http'
import {MOCK_BRANCHES} from '../net/github/Branches.fixture'
import {MOCK_COMMENTS, MOCK_COMMENTS_POST_DELETION} from '../net/github/Comments.fixture'
import {MOCK_COMMITS} from '../net/github/Commits.fixture'
import {MOCK_FILES} from '../net/github/Files.fixture'
import {createMockIssues, sampleIssues} from '../net/github/Issues.fixture'
import {MOCK_ORGANIZATIONS} from '../net/github/Organizations.fixture'
import {MOCK_REPOSITORY, MOCK_USER_REPOSITORIES} from '../net/github/Repositories.fixture'


let commentDeleted = false


/**
 * Initialize API handlers, including Google Analytics and GitHub.
 *
 * @return {Array<object>} handlers
 */
export function initHandlers(defines) {
  const handlers = []
  handlers.push(...workersAndWasmPassthrough())
  handlers.push(...bldrsHandlers())
  handlers.push(...gaHandlers())
  handlers.push(...githubHandlers(defines, true))
  handlers.push(...githubHandlers(defines, false))
  handlers.push(...netlifyHandlers())
  handlers.push(...stripePortalHandlers())
  handlers.push(...subscribePageHandler())
  return handlers
}


/**
 * Let requests for web workers, wasm and related files to passthrough.
 *
 * @return {Array<object>} handlers
 */
function workersAndWasmPassthrough() {
  return [
    // Caching + OPFS
    http.get(/\/Cache\.js$/, () => passthrough()),
    http.get(/\/OPFS\.Worker\.js$/, () => passthrough()),
    // Conway
    http.get(/ConwayGeomWasmWebMT\.wasm$/i, () => passthrough()),
    http.get(/ConwayGeomWasmWebMT\.js$/i, () => passthrough()),
    // Icons
    http.get(/\/favicon\.ico$/, () => passthrough()),
    http.get(/\/icons/, () => passthrough()),
  ]
}


/**
 * Null route prod static icon requests.
 *
 * @return {Array<object>} handlers
 */
function bldrsHandlers() {
  return [
    http.get('http://bldrs.ai/icons/*', () => {
      return new Response('', {
        status: HTTP_OK,
        headers: {'Content-Type': 'text/plain'},
      })
    }),
  ]
}


/**
 * Handlers for Netlify functions
 *
 * @return {Array<object>} handlers
 */
function netlifyHandlers() {
  return [
    http.post('/.netlify/functions/create-portal-session', async ({request}) => {
      const {stripeCustomerId} = await request.json()

      if (!stripeCustomerId) {
        return new Response(
          JSON.stringify({error: 'Missing stripeCustomerId'}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      // return a mocked Stripe billing-portal URL
      const fakeUrl = `https://stripe.portal.msw/mockportal/session/${stripeCustomerId}`
      return new Response(
        JSON.stringify({url: fakeUrl}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),
  ]
}

/**
 * Mock out the “/subscribe” page itself.
 *
 * @return {Array<object>} handlers
 */
function subscribePageHandler() {
  return [
    // this will catch GET /subscribe, /subscribe/, or /subscribe?foo=bar
    http.get('/subscribe*', () => {
      return new Response(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <title>Mock Subscribe Page</title>
            </head>
            <body>
              <h1>Mock Subscribe Page</h1>
              <p>Mock Stripe UI.</p>
              <button id="start-payment">Start Payment</button>
            </body>
          </html>
        `.trim(), {
        status: HTTP_OK,
        headers: {'Content-Type': 'text/html'},
      })
    }),
  ]
}


/**
 * Catch the client navigating to the fake Stripe portal page.
 *
 * @return {Array<object>} handlers
 */
function stripePortalHandlers() {
  return [
    http.get('https://stripe.portal.msw/mockportal/session/:stripeCustomerId', () => {
      return new Response('<html><body><h1>Mock Stripe Portal</h1></body></html>', {
        status: HTTP_OK,
        headers: {'Content-Type': 'text/html'},
      })
    }),
  ]
}

/**
 * Mock to disable Google Analytics.
 *
 * @return {Array<object>} handlers
 */
function gaHandlers() {
  return [
    http.get('https://www.google-analytics.com/*', () => {
      return new Response(
        JSON.stringify({}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.post('https://www.google-analytics.com/*', () => {
      return new Response(null, {
        status: HTTP_OK,
      })
    }),

    http.get('https://www.googletagmanager.com/*', () => {
      return new Response(
        JSON.stringify({}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),
  ]
}


/**
 * Static stubs GitHub orgs, repos, issues.
 *
 * @param {object} defines todo implementation
 * @return {Array<object>} handlers
 */
function githubHandlers(defines, authed) {
  const GH_BASE_AUTHED = defines.GITHUB_BASE_URL
  const GH_BASE_UNAUTHED = defines.GITHUB_BASE_URL_UNAUTHENTICATED
  return [
    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues`, ({params}) => {
      const {org, repo} = params
      const createdIssues = createMockIssues(org, repo, sampleIssues)
      return new Response(
        JSON.stringify(createdIssues),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber/comments`, ({params}) => {
      const {org, repo, issueNumber} = params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return new Response(null, {status: HTTP_NOT_FOUND})
      }

      if (commentDeleted) {
        commentDeleted = false
        return new Response(
          JSON.stringify(MOCK_COMMENTS_POST_DELETION.data),
          {
            status: HTTP_OK,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      return new Response(
        JSON.stringify(MOCK_COMMENTS.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/contents/:path`, ({params, request}) => {
      const {org, repo, path} = params
      const ref = new URL(request.url).searchParams.get('ref')

      if ((org === 'cypresstester') ||
           (org === 'Swiss-Property-AG' &&
            repo === 'Momentum-Public' &&
            path === 'Momentum.ifc' &&
            (ref === 'main' ||
             ref === 'testsha1testsha1testsha1testsha1testsha1' ||
             ref === 'testsha2testsha2testsha2testsha2testsha2' ||
             ref === 'testsha3testsha3testsha3testsha3testsha3'))) {
        const downloadUrl = (org === 'cypresstester' && path !== 'window.ifc') ? '/index.ifc' :
            `${process.env.RAW_GIT_PROXY_URL}/${org}/${repo}/${ref}/${path}`

        return new Response(
          JSON.stringify({
            name: 'test-model.ifc',
            path: 'cypresstester/test-repo/test-model.ifc',
            sha: '1fc13089c8851fd9c5d39cda54788823a8606564',
            size: 36206,
            url: 'https://api.github.com/repos/cypresstester/test-repo/contents/test-model.ifc?ref=main',
            html_url: 'https://github.com/cypresstester/test-repo/contents/test-model.ifc',
            git_url: 'https://api.github.com/repos/cypresstester/test-repo/git/blobs/1fc13089c8851fd9c5d39cda54788823a8606564',
            download_url: downloadUrl,
            type: 'file',
            content: 'dGVzdCBkYXRh\n',
            encoding: 'base64',
            _links: {
              self: 'https://api.github.com/repos/cypresstester/test-repo/contents/test-model.ifc?ref=main',
              git: 'https://api.github.com/repos/cypresstester/test-repo/git/blobs/1fc13089c8851fd9c5d39cda54788823a8606564',
              html: 'https://github.com/cypresstester/test-repo/contents/test-model.ifc',
            },
          }),
          {
            status: HTTP_OK,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      if (org !== 'bldrs-ai' || repo !== 'Share' || path !== 'README.md') {
        return new Response(
          JSON.stringify({
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/http/reference/repos#get-repository-content',
          }),
          {
            status: HTTP_NOT_FOUND,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      let downloadURL = 'https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md'

      if (ref === 'main') {
        downloadURL += '?token=MAINBRANCHCONTENT'
      } else if (ref === 'a-new-branch') {
        downloadURL += '?token=TESTTOKENFORNEWBRANCH'
      }

      return new Response(
        JSON.stringify({
            name: 'README.md',
            path: 'README.md',
            sha: 'a5dd511780350dfbf2374196d8f069114a7d9205',
            size: 1359,
            url: `${GH_BASE_UNAUTHED}/repos/bldrs-ai/Share/contents/README.md?ref=main`,
            html_url: 'https://github.com/bldrs-ai/Share/blob/main/README.md',
            git_url: `${GH_BASE_UNAUTHED}/repos/bldrs-ai/Share/git/blobs/a5dd511780350dfbf2374196d8f069114a7d9205`,
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
              self: `${GH_BASE_UNAUTHED}/repos/bldrs-ai/Share/contents/README.md?ref=main`,
              git: `${GH_BASE_UNAUTHED}/repos/bldrs-ai/Share/git/blobs/a5dd511780350dfbf2374196d8f069114a7d9205`,
              html: 'https://github.com/bldrs-ai/Share/blob/main/README.md',
            },
        }),
        {
          status: HTTP_OK,
          headers: {'content-type': 'application/json; charset=utf-8'},
        },
      )
    }),

    http.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues`, ({params}) => {
      const {org, repo} = params

      if ( !(org === 'bldrs-ai' || org === 'pablo-mayrgundter') || repo !== 'Share') {
        return new Response(
          JSON.stringify({
            message: 'Not Found',
          }),
          {
            status: HTTP_NOT_FOUND,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      return new Response(null, {
        status: HTTP_CREATED,
      })
    }),

    http.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber/comments`, ({params}) => {
      const {org, repo, issueNumber} = params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return new Response(null, {status: HTTP_NOT_FOUND})
      }
      return new Response(null, {
        status: HTTP_CREATED,
      })
    }),

    http.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber`, ({params}) => {
      const {org, repo, issueNumber} = params
      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return new Response(
          JSON.stringify({
            message: 'Not Found',
          }),
          {
            status: HTTP_NOT_FOUND,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      return new Response(
        JSON.stringify({
          id: parseInt(issueNumber),
          number: parseInt(issueNumber),
          state: 'closed',
          state_reason: 'completed',
        }),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.delete(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/comments/:commentId`, ({params}) => {
      const {org, repo, commentId} = params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !commentId) {
        return new Response(null, {status: HTTP_NOT_FOUND})
      }

      commentDeleted = true

      return new Response(null, {
        status: HTTP_NO_CONTENT,
      })
    }),

    http.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/comments/:commentId`, () => {
      return new Response(null, {
        status: HTTP_OK,
      })
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/user/orgs`, ({request}) => {
      const authHeader = request.headers.get('authorization')

      if (!authHeader) {
        return new Response(
          JSON.stringify({
            message: 'Requires authentication',
            documentation_url: 'https://docs.github.com/http/reference/orgs#list-organizations-for-the-authenticated-user',
          }),
          {
            status: HTTP_AUTHORIZATION_REQUIRED,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      return new Response(
        JSON.stringify(MOCK_ORGANIZATIONS.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/user/repos`, () => {
      return new Response(
        JSON.stringify(MOCK_USER_REPOSITORIES.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/orgs/:org/repos`, ({params}) => {
      const {org} = params
      // Mock response for any organization, but only provide data for bldrs-ai
      if (org === 'bldrs-ai') {
        return new Response(
          JSON.stringify([MOCK_REPOSITORY]),
          {
            status: HTTP_OK,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      
      // Return empty array for other orgs
      return new Response(
        JSON.stringify([]),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/contents`, () => {
      return new Response(
        JSON.stringify(MOCK_FILES.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/branches`, () => {
      return new Response(
        JSON.stringify(MOCK_BRANCHES.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),


    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/commits`, ({params, request}) => {
      // Directly check params for 'failurecaseowner' and 'failurecaserepo'
      if (params.owner === 'failurecaseowner' && params.repo === 'failurecaserepo') {
        return new Response(
          JSON.stringify({sha: 'error'}),
          {
            status: HTTP_NOT_FOUND,
            headers: {'Content-Type': 'application/json'},
          },
        )
        // Handle non existent file request
      } else if (params.owner === 'nonexistentowner' && params.repo === 'nonexistentrepo') {
        return new Response(
          JSON.stringify([]),
          {
            status: HTTP_OK,
            headers: {'Content-Type': 'application/json'},
          },
        )
        // Handle unauthenticated case
      } else if (params.owner === 'unauthedcaseowner' && params.repo === 'unauthedcaserepo' ) {
       const requestUrl = request.url.toString()

       if ( requestUrl.includes(GH_BASE_AUTHED)) {
        return new Response(
          JSON.stringify({sha: 'error'}),
          {
            status: HTTP_NOT_FOUND,
            headers: {'Content-Type': 'application/json'},
          },
        )
      } else {
       return new Response(
         JSON.stringify(MOCK_COMMITS.data),
         {
           status: HTTP_OK,
           headers: {'Content-Type': 'application/json'},
         },
       )
      }
        // Handle authenticated case
      } else if (params.owner === 'authedcaseowner' && params.repo === 'authedcaserepo' ) {
        const requestUrl = request.url.toString()

         if ( requestUrl.includes(GH_BASE_UNAUTHED)) {
         return new Response(
           JSON.stringify({sha: 'error'}),
           {
             status: HTTP_NOT_FOUND,
             headers: {'Content-Type': 'application/json'},
           },
         )
       } else {
        return new Response(
          JSON.stringify(MOCK_COMMITS.data),
          {
            status: HTTP_OK,
            headers: {'Content-Type': 'application/json'},
          },
        )
       }
       }
      // For all other cases, return a success response
      return new Response(
        JSON.stringify(MOCK_COMMITS.data),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),


    /* Begin support for GitHub commitFile.  HTTP_BAD_REQUEST(400) is
     * used to indicate missing args, tho we're not sure what actual
     * GH returns for the various cases. */

    // octokit.http.git.getRef
    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/ref/:ref`, () => {
      return new Response(
        JSON.stringify({object: {sha: 'parentSha'}}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    // octokit.http.git.getCommit
    http.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/commits/:commit_sha`, () => {
      return new Response(
        JSON.stringify({tree: {sha: 'treeSha'}}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    // octokit.http.git.createBlob
    http.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/blobs`, async ({request}) => {
      const {content, encoding} = await request.json()
      if (content === undefined || encoding === undefined) {
        return new Response(
          JSON.stringify({success: false}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      return new Response(
        JSON.stringify({sha: 'blobSha'}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    // octokit.http.git.createTree
    http.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/trees`, async ({request}) => {
      // eslint-disable-next-line camelcase
      const {base_tree, tree} = await request.json()
      // eslint-disable-next-line camelcase
      if (base_tree === undefined || tree === undefined) {
        return new Response(
          JSON.stringify({success: false}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      return new Response(
        JSON.stringify({sha: 'newTreeSha'}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    // octokit.http.git.createCommit
    http.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/commits`, async ({request}) => {
      const {message, tree, parents} = await request.json()
      if (message === undefined || tree === undefined || parents === undefined) {
        return new Response(
          JSON.stringify({success: false}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      return new Response(
        JSON.stringify({sha: 'newCommitSha'}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    // octokit.http.git.updateRef
    http.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/refs/:ref`, async ({request}) => {
      const {sha} = await request.json()
      if (sha === undefined) {
        return new Response(
          JSON.stringify({success: false}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }
      return new Response(
        JSON.stringify({sha: 'smth'}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),
  ]
}
