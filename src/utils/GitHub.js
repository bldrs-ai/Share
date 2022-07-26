import {Octokit} from '@octokit/rest'
import PkgJson from '../../package.json'
import debug from './debug'
import {assertDefined} from './assert'
import {isRunningLocally} from './network'


/**
 * Fetch all of the issues from GitHub.
 * @param {Object} repository
 * @return {Array} The issue array of issue objects.
 */
export async function getIssues(repository) {
  const issues = await getGitHub(repository, 'issues')
  debug().log('GitHub: issue: ', repository, issues)
  return issues
}


/**
 * Fetch the issue with the given id from GitHub.  See MOCK_ISSUE
 * below for the expected structure.
 * @param {Object} repository
 * @param {Number} issueId
 * @return {Object} The issue object.
 */
export async function getIssue(repository, issueId) {
  const issue = await getGitHub(repository, 'issues/{issue_number}', {issue_number: issueId})
  debug().log('GitHub: issue: ', issue)
  return issue
}


/**
 * The comments should have the following structure:
 * @param {Object} repository
 * @param {Number} issueId
 * @return {Array} The comments array.
 */
export async function getComments(repository, issueId) {
  const comments = await getGitHub(
      repository,
      'issues/{issue_number}/comments',
      {
        issue_number: issueId,
      })
  debug().log('GitHub: comments: ', comments)
  if (comments && comments.data && comments.data.length > 0) {
    return comments.data
  } else {
    debug().log('Empty comments!')
  }
}


/**
 * The comments should have the following structure:
 * @param {Object} repository
 * @param {Number} issueId
 * @param {Number} commentId
 * @return {Object} The comment object.
 */
export async function getComment(repository, issueId, commentId) {
  const comments = await getGitHub(
      repository,
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
 * @param {Object} repository
 * @param {Object} path The resource path with arg substitution markers
 * @param {Object} args The args to substitute
 * @return {Object} The object at the resource
 */
async function getGitHub(repository, path, args) {
  assertDefined(repository.orgName)
  assertDefined(repository.name)
  debug().log('Dispatching GitHub request for repo:', repository)
  return await octokit.request(`GET /repos/{org}/{repo}/${path}`, {
    ...{
      org: repository.orgName,
      repo: repository.name,
    },
    ...args,
  })
}

export const MOCK_ISSUE = {
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
      title: 'BLDRS-LOCAL_MODE-ID:1257156364',
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

[Let's look at haus](/share/v/p/haus.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48)

\`\`\`
camera=#c:-29.47,18.53,111.13,-30.27,20.97,-10.06
\`\`\``,
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
      title: 'LOCAL ISSUE 2',
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
      // eslint-disable-next-line
      body: 'Test Issue body\r\n\r\n<img width=\'475\' alt=\'image\' src=\'https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png\'>\r\n\r\nimageURL\r\nhttps://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png\r\nimageURL\r\n\r\ncamera=#c:-29.47,18.53,111.13,-30.27,20.97,-10.06\r\n\r\n\r\nurl = http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48',
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
      id: 1144935479,
      node_id: 'IC_kwDOFwgxOc5EPlQ3',
      number: 1,
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
      // eslint-disable-next-line
      body: 'The Architecture, Engineering and Construction industries are trying to face challenging problems of the future with tools anchored in the past. Meanwhile, a new dynamic has propelled the Tech industry: online, collaborative, open development.\r\n\r\nWe cant imagine a future where building the rest of the world hasnt been transformed by these new ways of working. We are part of that transformation.\r\n\r\ncamera=#c:-108.43,86.02,62.15,-27.83,27.16,1.58\r\nurl = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-1.34 imageURL https://user-images.githubusercontent.com/3433606/178335990-11cc20fa-93e3-4bba-8651-e31f83165150.png imageURL',
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
      id: 1144935479,
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
      // eslint-disable-next-line
      body: ' Email is the medium that still facilitates major portion of communication.\r\n\r\ncamera=#c:-108.43,86.02,62.15,-27.83,27.16,1.58\r\nurl = http://localhost:8080/share/v/p/index.ifc#c:-141.9,72.88,21.66,-43.48,15.73,-1.34 imageURL https://user-images.githubusercontent.com/3433606/178335990-11cc20fa-93e3-4bba-8651-e31f83165150.png imageURL',
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


/**
 * Mock of Octokit for locally and unit testing.
 */
export class MockOctokit {
  /**
   * @param {string} path
   * @param {Object} account
   * @param {Object} args
   * @return {Object} Mock response
   */
  request(path, account, args) {
    debug().log(`GitHub: MockOctokit: request: ${path}, args: `, args)
    if (path.includes(`/repos/{org}/{repo}/issues/{issue_number}/comments`)) {
      return MOCK_COMMENTS
    }
    if (path.includes('/repos/{org}/{repo}/issues')) {
      return MOCK_ISSUES
    }
  }
}

// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
const octokit = isRunningLocally() ? new MockOctokit() : new Octokit({
  userAgent: `bldrs/${PkgJson.version}`,
})

