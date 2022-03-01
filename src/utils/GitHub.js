import {Octokit} from '@octokit/rest'
import PkgJson from '../../package.json'
import debug from './debug'
import {isRunningLocally} from './network'


/**
 * Fetch the issue with the given id from GitHub.  See MOCK_ISSUE
 * below for the expected structure.
 * @param {Number} issueId
 * @return {Object} The issue object.
 */
export async function getIssue(issueId) {
  const issue = await getGitHub('issues/{issue_number}', {issue_number: issueId})
  debug().log('GitHub: issue: ', issue)
  return issue
}


/**
 * The comments should have the following structure:
 * @param {Number} issueId
 * @param {Number} commentId
 * @return {Object} The comment object.
 */
export async function getComment(issueId, commentId) {
  const comments = await getGitHub(
      'issues/{issue_number}/comments',
      {
        issue_number: issueId,
      })
  debug().log('GitHub: comments: ', comments)
  if (comments && comments.data && comments.data.length > 0) {
    if (commentId > comments.data.length) {
      console.error(`Given commentId(${commentId}) is out of range(${comments.data.length}): `)
      return
    }
    return comments.data[commentId]
  } else {
    console.warn('Empty comments!')
  }
}


// DO NOT EXPORT ANY BELOW //
/**
 * Fetch the resource at the given path from GitHub, substituting in
 * the given args.
 * @param {Object} path The resource path with arg substitution markers
 * @param {Object} args The args to substitute
 * @return {Object} The object at the resource
 */
async function getGitHub(path, args) {
  const account = {
    owner: 'pablo-mayrgundter',
    repo: 'Share',
  }
  return await octokit.request(`GET /repos/{owner}/{repo}/${path}`, {
    ...account,
    ...args,
  })
}


/**
 * Mock of Octokit for locally and unit testing.
 */
class MockOctokit {
  /** No-op ctor. */
  constructor() {}


  /**
   * @param {string} path
   * @param {Object} account
   * @param {Object} args
   * @return {Object} Mock response
   */
  request(path, account, args) {
    debug().log(`GitHub: MockOctokit: request: ${path}, args: `, args)
    switch (true) {
      case /.*\/issues\/{.+}$/.test(path): return MOCK_ISSUE
      case /.*\/issues\/{.+}\/comments$/.test(path): return MOCK_COMMENTS
      default: throw new Error('Mock does not support server path: ' + path)
    }
  }
}


const MOCK_ISSUE = {
  data: {
    title: 'Hello Mock Issue!',
    body: `1) Welcome to this awesome awesome\r
\`\`\`\r
url=//${window.location.host}/share/v/p/index.ifc#i:8:0::c:-13.03,9.719,26.88\r
\`\`\`\r
`,
  },
}


const MOCK_COMMENTS = {
  data: [
    {
      body: `2) How awesome??  Awesome awesome\r
\`\`\`\r
url=//${window.location.host}/share/v/p/index.ifc#i:8::c:-20.73,25.54,5.982\r
\`\`\`\r
`,
    },
  ],
}


// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
const octokit = isRunningLocally() ? new MockOctokit() : new Octokit({
  userAgent: `bldrs/${PkgJson.version}`,
})
