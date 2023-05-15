import {rest} from 'msw'
import {
  MOCK_COMMENTS,
  MOCK_ISSUES,
  MOCK_ORGANIZATIONS,
  MOCK_REPOSITORY,
  MOCK_FILES,
} from '../utils/GitHub'


const httpOk = 200
const httpCreated = 201
const httpAuthorizationRequired = 401
const httpNotFound = 404

export const handlers = [
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
          _links: {
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
        ctx.json({
          data: [MOCK_FILES],
        }),
    )
  }),
]
