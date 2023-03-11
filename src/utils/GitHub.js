import {Octokit} from '@octokit/rest'
import debug from './debug'
import PkgJson from '../../package.json'
import {assertDefined} from './assert'


/**
 * Fetch all of the issues from GitHub.
 *
 * @param {object} repository
 * @param {string} accessToken Github API OAuth access token
 * @return {Array} The issue array of issue objects.
 */
export async function getIssues(repository, accessToken = '') {
  const args = {}
  if (accessToken.length > 0) {
    args.headers = {
      'authorization': `Bearer ${accessToken}`,
      'if-modified-since': '',
      'if-none-match': '',
      ...args.headers,
    }
  }

  const issues = await getGitHub(repository, 'issues', args)
  debug().log('GitHub: issue: ', repository, issues)
  return issues
}


/**
 * Fetch the issue with the given id from GitHub.  See MOCK_ISSUE
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {number} issueId
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The issue object.
 */
export async function getIssue(repository, issueId, accessToken = '') {
  const args = {
    issue_number: issueId,
  }

  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }

  const issue = await getGitHub(repository, 'issues/{issue_number}', args)
  debug().log('GitHub: issue: ', issue)
  return issue
}


/**
 * Post issue to github
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The issue object.
 */
export async function postIssue(repository, payload, accessToken = '') {
  const args = {
    ...payload,
  }
  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const res = await postGitHub(repository, 'issues', args)
  return res
}


/**
 * Close Github issue
 *
 * @param {object} repository
 * @param {object} issueNumber issue number
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The issue object.
 */
export async function closeIssue(repository, issueNumber, accessToken = '') {
  const args = {
    issue_number: issueNumber,
    state: 'closed',
  }
  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const patchRes = await patchGitHub(repository, `issues/${issueNumber}`, args)
  debug().log('GitHub#closeIssue: patchRes: ', patchRes)
  return patchRes
}


/**
 * Fetch the issue with the given id from GitHub.  See MOCK_ISSUE
 * below for the expected structure.
 *
 * @param {object} repository
 * @return {object} the branches.
 */
export async function getBranches(repository, accessToken = '') {
  const args = {}

  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }

  const branches = await getGitHub(repository, 'branches', args)
  debug().log('GitHub: branches: ', branches)
  return branches
}


/**
 * The comments should have the following structure:
 *
 * @param {object} repository
 * @param {number} issueId
 * @param {string} accessToken Github API OAuth access token
 * @return {Array} The comments array.
 */
export async function getComments(repository, issueId, accessToken = '') {
  const args = {
    issue_number: issueId,
  }

  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }

  const comments = await getGitHub(repository, 'issues/{issue_number}/comments', args)
  debug().log('GitHub: comments: ', comments)

  if (comments && comments.data && comments.data.length > 0) {
    return comments.data
  } else {
    debug().log('Empty comments!')
  }
}


/**
 * The comments should have the following structure:
 *
 * @param {object} repository
 * @param {number} issueId
 * @param {number} commentId
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The comment object.
 */
export async function getComment(repository, issueId, commentId, accessToken = '') {
  const args = {
    issue_number: issueId,
  }

  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }

  const comments = await getGitHub(repository, 'issues/{issue_number}/comments', args)
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


/**
 * Post issue to github
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {number} issueNumber
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The issue object.
 */
export async function postComment(repository, issueNumber, payload, accessToken = '') {
  const args = {
    ...payload,
    issue_number: issueNumber,
  }
  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const res = await postGitHub(repository, `issues/{issue_number}/comments`, args)
  return res
}


/**
 * Delete comment from github
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {string} commentId
 * @param {string} accessToken Github API OAuth access token
 * @return {object} The issue object.
 */
export async function deleteComment(repository, commentId, accessToken = '') {
  const args = {
    comment_id: commentId,
  }
  if (accessToken.length > 0) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const res = await deleteGitHub(repository, `issues/comments/{comment_id}`, args)
  return res
}


/**
 * Retrieves the contents download URL for a GitHub repository path
 *
 * @param {object} repository
 * @param {string} path
 * @param {string} [ref]
 * @param {string} [accessToken]
 * @return {Promise} Promise URL to the contents
 */
export async function getDownloadURL(repository, path, ref = '', accessToken = '') {
  const args = {
    path: path,
    ref: ref,
  }

  if (accessToken.length > 0) {
    args.headers = {
      'authorization': `Bearer ${accessToken}`,
      'if-modified-since': '',
      'if-none-match': '',
      ...args.headers,
    }
  }

  const contents = await getGitHub(repository, 'contents/{path}?ref={ref}', args)
  if (!contents || !contents.data || !contents.data.download_url || !contents.data.download_url.length > 0) {
    throw new Error('No contents returned from GitHub')
  }

  return contents.data.download_url
}


/**
 * Parses a GitHub repository URL and returns a structure
 *
 * @param {string} githubURL
 * @return {object} A repository path object.
 */
export const parseGitHubRepositoryURL = (githubURL) => {
  if (githubURL.indexOf('://') === -1) {
    throw new Error('URL must be fully qualified and contain scheme')
  }

  const url = new URL(githubURL)

  const host = url.host.toLowerCase()
  if (host !== 'github.com' && host !== 'raw.githubusercontent.com') {
    throw new Error('Not a valid GitHub repository URL')
  }

  const pathParts = [
    '(?<owner>[^/]+)',
    '(?<repository>[^/]+)',
    '(?:(?<isBlob>blob)/)?(?<ref>[^/]+)',
    '(?<path>.+)',
  ]
  const match = url.pathname.match(`^/${pathParts.join('/')}$`)
  if (match === null) {
    throw new Error('Could not match GitHub repository URL')
  }

  const {groups: {owner, repository, ref, path}} = match
  return {
    url: url,
    owner: owner,
    repository: repository,
    ref: ref,
    path: path,
  }
}


// DO NOT EXPORT ANY BELOW //
/**
 * Fetch the resource at the given path from GitHub, substituting in
 * the given args.
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args to substitute
 * @return {object} The object at the resource
 */
async function getGitHub(repository, path, args = {}) {
  assertDefined(repository.orgName)
  assertDefined(repository.name)
  const res = await octokit.request(`GET /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  })
  return res
}


/**
 * Post the resource to the GitHub
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for posting
 * @return {object} The object at the resource
 */
async function postGitHub(repository, path, args = {}) {
  debug().log('GitHub#postGitHub: args: ', args)
  assertDefined(repository.orgName)
  assertDefined(repository.name)
  const requestStr = `POST /repos/{org}/{repo}/${path}`
  debug().log('GitHub#postGitHub: requestStr: ', requestStr)
  const requestObj = {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }
  debug().log('GitHub#postGitHub: requestObj: ', requestObj)
  const res = await octokit.request(requestStr, requestObj)
  return res
}


/**
 * Delete the resource to the GitHub
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for posting
 * @return {object} Result
 */
async function deleteGitHub(repository, path, args = {}) {
  assertDefined(repository.orgName)
  assertDefined(repository.name)
  const requestStr = `DELETE /repos/{org}/{repo}/${path}`
  debug().log('GitHub#deleteGitHub: requestStr: ', requestStr)
  const requestObj = {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }
  debug().log('GitHub#deleteGitHub: requestObj: ', requestObj)
  const res = await octokit.request(requestStr, requestObj)
  return res
}


/**
 * Patch the resource
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for patching
 * @return {object} The object at the resource
 */
async function patchGitHub(repository, path, args = {}) {
  assertDefined(repository.orgName)
  assertDefined(repository.name)
  debug().log('Dispatching GitHub request for repo:', repository)
  const res = await octokit.request(`PATCH /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  })
  return res
}


export const MOCK_NOTE = {
  embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
  index: 0,
  id: 10,
  number: 1,
  title: 'TEST_ISSUE_TITLE_1',
  body: 'TEST_ISSUE_BODY_1',
  date: '2022-06-01T22:10:49Z',
  username: 'TEST_ISSUE_USERNAME',
  avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
  numberOfComments: 2,
  imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
}

export const MOCK_NOTES = [
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 10,
    number: 1,
    title: 'open_workspace',
    body: 'BLDRS aims to enable asynchronous workflows by integrating essential communication channels and open standard.',
    date: '2022-06-01T22:10:49Z',
    username: 'TEST_ISSUE_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
  {
    embeddedUrl: 'url = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-4.34',
    index: 0,
    id: 11,
    number: 2,
    title: 'closed_system',
    body: 'It is common for knowledge workers in the AEC industry to operate within information bubbles.2',
    date: '2022-06-01T22:10:49Z',
    username: 'TEST_ISSUE_USERNAME',
    avatarUrl: 'https://avatars.githubusercontent.com/u/3433606?v=4',
    numberOfComments: 2,
    imageUrl: 'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png',
  },
]

export const MOCK_ISSUES = {
  data: [
    {
      url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17',
      repository_url: 'https://api.github.com/repos/pablo-mayrgundter/Share',
      labels_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/labels{/name}',
      comments_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/comments',
      events_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/events',
      html_url: 'https://github.com/pablo-mayrgundter/Share/issues/17',
      id: 1257156364,
      node_id: 'I_kwDOFwgxOc5K7q8M',
      number: 1,
      title: 'Local issue - some text is here to test - Id:1257156364',
      user: {
        login: 'OlegMoshkovich',
        id: 3433606,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        avatar_url: 'https://avatars.githubusercontent.com/u/3433606?v=4',
        gravatar_id: '',
        url: 'https://api.github.com/users/OlegMoshkovich',
        html_url: 'https://github.com/OlegMoshkovich',
        followers_url: 'https://api.github.com/users/OlegMoshkovich/followers',
        following_url: 'https://api.github.com/users/OlegMoshkovich/following{/other_user}',
        gists_url: 'https://api.github.com/users/OlegMoshkovich/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/OlegMoshkovich/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/OlegMoshkovich/subscriptions',
        organizations_url: 'https://api.github.com/users/OlegMoshkovich/orgs',
        repos_url: 'https://api.github.com/users/OlegMoshkovich/repos',
        events_url: 'https://api.github.com/users/OlegMoshkovich/events{/privacy}',
        received_events_url: 'https://api.github.com/users/OlegMoshkovich/received_events',
        type: 'User',
        site_admin: false,
      },
      labels: [],
      state: 'open',
      locked: false,
      assignee: null,
      assignees: [],
      milestone: null,
      comments: 2,
      created_at: '2022-06-01T22:10:49Z',
      updated_at: '2022-06-30T20:47:59Z',
      closed_at: null,
      author_association: 'NONE',
      active_lock_reason: null,
      body: `*BLDRS* aims to enable asynchronous workflows by  integrating essential communication channels and open standard.
      ![bldrs ecosystem](https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png)
      [Camera 1](http://localhost:8080/share/v/p/index.ifc#c:-29.47,18.53,111.13,-30.27,20.97,-10.06)`,
      reactions: {
        'url': 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/reactions',
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      timeline_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/timeline',
      performed_via_github_app: null,
      state_reason: null,
    },
    {
      url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17',
      repository_url: 'https://api.github.com/repos/pablo-mayrgundter/Share',
      labels_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/labels{/name}',
      comments_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/comments',
      events_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/events',
      html_url: 'https://github.com/pablo-mayrgundter/Share/issues/17',
      id: 2,
      node_id: 'I_kwDOFwgxOc5K7q8M',
      number: 2,
      title: 'Local issue 2',
      user: {
        login: 'OlegMoshkovich',
        id: 3433606,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        avatar_url: 'https://avatars.githubusercontent.com/u/3433606?v=4',
        gravatar_id: '',
        url: 'https://api.github.com/users/OlegMoshkovich',
        html_url: 'https://github.com/OlegMoshkovich',
        followers_url: 'https://api.github.com/users/OlegMoshkovich/followers',
        following_url: 'https://api.github.com/users/OlegMoshkovich/following{/other_user}',
        gists_url: 'https://api.github.com/users/OlegMoshkovich/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/OlegMoshkovich/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/OlegMoshkovich/subscriptions',
        organizations_url: 'https://api.github.com/users/OlegMoshkovich/orgs',
        repos_url: 'https://api.github.com/users/OlegMoshkovich/repos',
        events_url: 'https://api.github.com/users/OlegMoshkovich/events{/privacy}',
        received_events_url: 'https://api.github.com/users/OlegMoshkovich/received_events',
        type: 'User',
        site_admin: false,
      },
      labels: [],
      state: 'open',
      locked: false,
      assignee: null,
      assignees: [],
      milestone: null,
      comments: 0,
      created_at: '2022-06-01T22:10:49Z',
      updated_at: '2022-06-30T20:47:59Z',
      closed_at: null,
      author_association: 'NONE',
      active_lock_reason: null,
      body: `Test Issue body
      - [cam 1](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48)
      - [cam 2](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48)
      - [cam 3](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48)`,
      reactions: {
        'url': 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/reactions',
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      timeline_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17/timeline',
      performed_via_github_app: null,
      state_reason: null,
    },
  ],
}

export const MOCK_COMMENTS = {
  data: [
    {
      url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/comments/1144935479',
      html_url: 'https://github.com/pablo-mayrgundter/Share/issues/17#issuecomment-1144935479',
      issue_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17',
      id: 1144935480,
      node_id: 'IC_kwDOFwgxOc5EPlQ3',
      number: 1,
      user: {
        login: 'OlegMoshkovich',
        id: 3433607,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        avatar_url: 'https://avatars.githubusercontent.com/u/3433606?v=4',
        gravatar_id: '',
        url: 'https://api.github.com/users/OlegMoshkovich',
        html_url: 'https://github.com/OlegMoshkovich',
        followers_url: 'https://api.github.com/users/OlegMoshkovich/followers',
        following_url: 'https://api.github.com/users/OlegMoshkovich/following{/other_user}',
        gists_url: 'https://api.github.com/users/OlegMoshkovich/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/OlegMoshkovich/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/OlegMoshkovich/subscriptions',
        organizations_url: 'https://api.github.com/users/OlegMoshkovich/orgs',
        repos_url: 'https://api.github.com/users/OlegMoshkovich/repos',
        events_url: 'https://api.github.com/users/OlegMoshkovich/events{/privacy}',
        received_events_url: 'https://api.github.com/users/OlegMoshkovich/received_events',
        type: 'User',
        site_admin: false,
      },
      created_at: '2022-06-02T14:31:04Z',
      updated_at: '2022-06-08T08:18:43Z',
      author_association: 'NONE',
      body: `The Architecture, Engineering and Construction industries are trying
      to face challenging problems of the future with tools anchored in the
      past. Meanwhile, a new dynamic has propelled the Tech industry:
      online, collaborative, open development.

      We can't imagine a future where building the rest of the world hasn't
      been transformed by these new ways of working. We are part of that
      transformation.

      [a link](https://bldrs.ai/share/v/gh/pablo-mayrgundter/ifctool/main/index.ifc#c:-108.43,86.02,62.15,-27.83,27.16,1.58)`,
      reactions: {
        'url': 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/comments/1144935479/reactions',
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      performed_via_github_app: null,
    },
    {
      url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/comments/1144935479',
      html_url: 'https://github.com/pablo-mayrgundter/Share/issues/17#issuecomment-1144935479',
      issue_url: 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/17',
      id: 1144935481,
      number: 2,
      node_id: 'IC_kwDOFwgxOc5EPlQ3',
      user: {
        login: 'OlegMoshkovich',
        id: 3433606,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        avatar_url: 'https://avatars.githubusercontent.com/u/3433606?v=4',
        gravatar_id: '',
        url: 'https://api.github.com/users/OlegMoshkovich',
        html_url: 'https://github.com/OlegMoshkovich',
        followers_url: 'https://api.github.com/users/OlegMoshkovich/followers',
        following_url: 'https://api.github.com/users/OlegMoshkovich/following{/other_user}',
        gists_url: 'https://api.github.com/users/OlegMoshkovich/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/OlegMoshkovich/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/OlegMoshkovich/subscriptions',
        organizations_url: 'https://api.github.com/users/OlegMoshkovich/orgs',
        repos_url: 'https://api.github.com/users/OlegMoshkovich/repos',
        events_url: 'https://api.github.com/users/OlegMoshkovich/events{/privacy}',
        received_events_url: 'https://api.github.com/users/OlegMoshkovich/received_events',
        type: 'User',
        site_admin: false,
      },
      created_at: '2022-06-02T14:31:04Z',
      updated_at: '2022-06-08T08:18:43Z',
      author_association: 'NONE',
      body: `Email is the medium that still facilitates major portion of communication.

      [Camera 1](http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-1.34)
      [Camera 2](http://localhost:8080/share/v/p/index.ifc#c:-#c:-108.43,86.02,62.15,-27.83,27.16,1.58)`,
      reactions: {
        'url': 'https://api.github.com/repos/pablo-mayrgundter/Share/issues/comments/1144935479/reactions',
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      performed_via_github_app: null,
    },
  ],
}

export const MOCK_BRANCHES = {
  data: [
    {
      name: 'Version-1',
      commit: {
        sha: 'f51a6f2fd087d7562c4a63edbcff0b3a2b4226a7',
        url: 'https://api.github.com/repos/Swiss-Property-AG/Seestrasse-Public/commits/f51a6f2fd087d7562c4a63edbcff0b3a2b4226a7',
      },
      protected: false,
    },
    {
      name: 'main',
      commit: {
        sha: 'dc8027a5eb1d386bab7b64440275e9ffba7520a0',
        url: 'https://api.github.com/repos/Swiss-Property-AG/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0',
      },
      protected: false,
    },
  ],
}

export const MOCK_ONE_BRANCH = {
  data: [
    {
      name: 'main',
      commit: {
        sha: 'dc8027a5eb1d386bab7b64440275e9ffba7520a0',
        url: 'https://api.github.com/repos/Swiss-Property-AG/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0',
      },
      protected: false,
    },
  ],
}

export const MOCK_ISSUES_EMPTY = {data: []}

export const MOCK_MODEL_PATH_GIT = {
  org: 'Swiss-Property-AG',
  repo: 'Schneestock-Public',
  branch: 'main',
  filepath: '/ZGRAGGEN.ifc',
  eltPath: '',
  gitpath: 'https://raw.githubusercontent.com/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc',
}

export const MOCK_MODEL_PATH_LOCAL = {
  filepath: '/4f080237-b4e4-4ede-8885-d498647f15e6.ifc',
  eltPath: '',
}

// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
const octokit = new Octokit({
  baseUrl: process.env.GITHUB_BASE_URL,
  userAgent: `bldrs/${PkgJson.version}`,
})
