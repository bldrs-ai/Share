import {rest} from 'msw'
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
 * Null route prod static icon requests.
 *
 * @return {Array<object>} handlers
 */
function bldrsHandlers() {
  return [
    rest.get('http://bldrs.ai/icons/*', (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
          ctx.text(''),
      )
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
    rest.post('/.netlify/functions/create-portal-session', async (req, res, ctx) => {
      const {stripeCustomerId} = await req.json()

      if (!stripeCustomerId) {
        return res(
          ctx.status(HTTP_BAD_REQUEST),
          ctx.json({error: 'Missing stripeCustomerId'}),
        )
      }

      // return a mocked Stripe billing-portal URL
      const fakeUrl = `https://stripe.portal.msw/mockportal/session/${stripeCustomerId}`
      return res(
        ctx.status(HTTP_OK),
        ctx.json({url: fakeUrl}),
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
    rest.get('/subscribe*', (req, res, ctx) => {
      return res(
        ctx.status(HTTP_OK),
        ctx.set('Content-Type', 'text/html'),
        ctx.body(`
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
        `.trim()),
      )
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
    rest.get('https://stripe.portal.msw/mockportal/session/:stripeCustomerId', (req, res, ctx) => {
      return res(
        ctx.status(HTTP_OK),
        ctx.text('<html><body><h1>Mock Stripe Portal</h1></body></html>'),
      )
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
    rest.get('https://www.google-analytics.com/*', (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
          ctx.json({}),
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
    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues`, (req, res, ctx) => {
      const {org, repo} = req.params
      const createdIssues = createMockIssues(org, repo, sampleIssues)
      return res(
          ctx.status(HTTP_OK),
          ctx.json(createdIssues),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber/comments`, (req, res, ctx) => {
      const {org, repo, issueNumber} = req.params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return res(ctx.status(HTTP_NOT_FOUND))
      }

      if (commentDeleted) {
        commentDeleted = false
        return res(
          ctx.status(HTTP_OK),
          ctx.json(MOCK_COMMENTS_POST_DELETION.data),
        )
      }
      return res(
          ctx.status(HTTP_OK),
          ctx.json(MOCK_COMMENTS.data),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/contents/:path`, (req, res, ctx) => {
      const {org, repo, path} = req.params
      const ref = req.url.searchParams.get('ref')

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

        return res(
          ctx.status(HTTP_OK),
          ctx.json({
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
        )
      }

      if (org !== 'bldrs-ai' || repo !== 'Share' || path !== 'README.md') {
        return res(
            ctx.status(HTTP_NOT_FOUND),
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
          ctx.status(HTTP_OK),
          ctx.set({
            'content-type': 'application/json; charset=utf-8',
          }),
          ctx.json({
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
      )
    }),

    rest.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues`, (req, res, ctx) => {
      const {org, repo} = req.params

      if ( !(org === 'bldrs-ai' || org === 'pablo-mayrgundter') || repo !== 'Share') {
        return res(
          ctx.status(HTTP_NOT_FOUND),
          ctx.json({
            message: 'Not Found',
          }),
        )
      }

      return res(
        ctx.status(HTTP_CREATED),
      )
    }),

    rest.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber/comments`, (req, res, ctx) => {
      const {org, repo, issueNumber} = req.params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !issueNumber) {
        return res(ctx.status(HTTP_NOT_FOUND))
      }
      return res(
          ctx.status(HTTP_CREATED),
      )
    }),

    rest.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/:issueNumber`, (req, res, ctx) => {
      const {org, repo} = req.params
      if (org !== 'pablo-mayrgundter' || repo !== 'Share' ) {
        return res(
            ctx.status(HTTP_NOT_FOUND),
            ctx.json({
              message: 'Not Found',
            }),
        )
      }

      return res(
          ctx.status(HTTP_OK),
      )
    }),

    rest.delete(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/comments/:commentId`, (req, res, ctx) => {
      const {org, repo, commentId} = req.params

      if (org !== 'pablo-mayrgundter' || repo !== 'Share' || !commentId) {
        return res(ctx.status(HTTP_NOT_FOUND))
      }

      commentDeleted = true

      return res(
          ctx.status(HTTP_NO_CONTENT),
      )
    }),

    rest.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:org/:repo/issues/comments/:commentId`, (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/user/orgs`, (req, res, ctx) => {
      const authHeader = req.headers.get('authorization')

      if (!authHeader) {
        return res(
            ctx.status(HTTP_AUTHORIZATION_REQUIRED),
            ctx.json({
              message: 'Requires authentication',
              documentation_url: 'https://docs.github.com/rest/reference/orgs#list-organizations-for-the-authenticated-user',
            }),
        )
      }

      return res(
          ctx.status(HTTP_OK),
          ctx.json(MOCK_ORGANIZATIONS.data),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/user/repos`, (req, res, ctx) => {
      return res(
        ctx.status(HTTP_OK),
        ctx.json(MOCK_USER_REPOSITORIES.data),
    )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/orgs/bldrs-ai/repos`, (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
          ctx.json({
            data: [MOCK_REPOSITORY],
          }),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/contents`, (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
          ctx.json(MOCK_FILES.data),
      )
    }),

    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/branches`, (req, res, ctx) => {
      return res(
        ctx.status(HTTP_OK),
        ctx.json(MOCK_BRANCHES.data),
      )
    }),


    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/commits`, (req, res, ctx) => {
      // Directly check req.params for 'failurecaseowner' and 'failurecaserepo'
      if (req.params.owner === 'failurecaseowner' && req.params.repo === 'failurecaserepo') {
        return res(
          ctx.status(HTTP_NOT_FOUND),
          ctx.json({sha: 'error'}),
        )
        // Handle non existent file request
      } else if (req.params.owner === 'nonexistentowner' && req.params.repo === 'nonexistentrepo') {
        return res(
          ctx.status(HTTP_OK),
          ctx.json([]),
        )
        // Handle unauthenticated case
      } else if (req.params.owner === 'unauthedcaseowner' && req.params.repo === 'unauthedcaserepo' ) {
       const requestUrl = req.url.toString()

       if ( requestUrl.includes(GH_BASE_AUTHED)) {
        return res(
          ctx.status(HTTP_NOT_FOUND),
          ctx.json({sha: 'error'}),
        )
      } else {
       return res(
         ctx.status(HTTP_OK),
         ctx.json(MOCK_COMMITS.data),
       )
      }
        // Handle authenticated case
      } else if (req.params.owner === 'authedcaseowner' && req.params.repo === 'authedcaserepo' ) {
        const requestUrl = req.url.toString()

         if ( requestUrl.includes(GH_BASE_UNAUTHED)) {
         return res(
           ctx.status(HTTP_NOT_FOUND),
           ctx.json({sha: 'error'}),
         )
       } else {
        return res(
          ctx.status(HTTP_OK),
          ctx.json(MOCK_COMMITS.data),
        )
       }
       }
      // For all other cases, return a success response
      return res(
        ctx.status(HTTP_OK),
        ctx.json(MOCK_COMMITS.data),
      )
    }),


    /* Begin support for GitHub commitFile.  HTTP_BAD_REQUEST(400) is
     * used to indicate missing args, tho we're not sure what actual
     * GH returns for the various cases. */

    // octokit.rest.git.getRef
    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/ref/:ref`, (req, res, ctx) => {
      return res(
          ctx.status(HTTP_OK),
          ctx.json({object: {sha: 'parentSha'}}),
      )
    }),

    // octokit.rest.git.getCommit
    rest.get(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/commits/:commit_sha`, (req, res, ctx) => {
      return res(
        ctx.status(HTTP_OK),
        ctx.json({tree: {sha: 'treeSha'}}),
      )
    }),

    // octokit.rest.git.createBlob
    rest.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/blobs`, async (req, res, ctx) => {
      const {content, encoding} = await req.body
      if (content === undefined || encoding === undefined) {
        return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
      }
      return res(
        ctx.status(HTTP_OK),
        ctx.json({sha: 'blobSha'}),
      )
    }),

    // octokit.rest.git.createTree
    rest.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/trees`, async (req, res, ctx) => {
      // eslint-disable-next-line camelcase
      const {base_tree, tree} = await req.body
      // eslint-disable-next-line camelcase
      if (base_tree === undefined || tree === undefined) {
        return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
      }
      return res(
        ctx.status(HTTP_OK),
        ctx.json({sha: 'newTreeSha'}),
      )
    }),

    // octokit.rest.git.createCommit
    rest.post(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/commits`, async (req, res, ctx) => {
      const {message, tree, parents} = await req.body
      if (message === undefined || tree === undefined || parents === undefined) {
        return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
      }
      return res(
        ctx.status(HTTP_OK),
        ctx.json({sha: 'newCommitSha'}),
      )
    }),

    // octokit.rest.git.updateRef
    rest.patch(`${authed ? GH_BASE_AUTHED : GH_BASE_UNAUTHED}/repos/:owner/:repo/git/refs/:ref`, async (req, res, ctx) => {
      const {sha} = await req.body
      if (sha === undefined) {
        return res(ctx.status(HTTP_BAD_REQUEST), ctx.json({success: false}))
      }
      return res(
        ctx.status(HTTP_OK),
        ctx.json({sha: 'smth'}),
      )
    }),
  ]
}
