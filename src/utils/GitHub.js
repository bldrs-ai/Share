import {Octokit} from '@octokit/rest'
import PkgJson from '../../package.json'
import {assertDefined} from './assert'
import debug from './debug'
// TODO(pablo): unit tests after nicks OPFS changes go in


/**
 * @param {object} repository
 * @param {string} filepath
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getCommitsForFile(repository, filepath, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, `commits`, {
    path: filepath,
  }, accessToken)
  const commitsArr = res.data
  return commitsArr
}


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Array} Array of issues response from GH
 */
export async function getIssues(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues', {}, accessToken)
  const issueArr = res.data
  debug().log('GitHub#getIssues: issueArr: ', issueArr)
  return issueArr
}


/**
 * @param {object} repository
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken Github API OAuth access token
 * @return {object} response from GH
 */
export async function createIssue(repository, payload, accessToken = '') {
  assertDefined(...arguments)
  const res = await postGitHub(repository, 'issues', payload, accessToken)
  debug().log('GitHub#createIssue: res: ', res)
  return res
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {object} response from GH sinle issue
 */
export async function getIssue(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  const issue = await getGitHub(repository, 'issues/{issueNumber}', {issueNumber}, accessToken)
  debug().log('GitHub#getIssue: issue: ', issue)
  return issue
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} title Issue/Note title
 * @param {string} body Issue/Note body
 * @param {string} accessToken
 * @return {object} response from GH
 */
export async function updateIssue(repository, issueNumber, title, body, accessToken) {
  assertDefined(...arguments)
  const args = {
    issue_number: issueNumber,
    body,
    title,
  }
  const res = await patchGitHub(repository, `issues/${issueNumber}`, args, accessToken)
  debug().log('GitHub#closeIssue: res: ', res)
  return res
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {object} responce from GH with the closed issue object
 */
export async function closeIssue(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  const args = {
    issueNumber,
    state: 'closed',
  }
  const res = await patchGitHub(repository, `issues/{issueNumber}`, args, accessToken)
  debug().log('GitHub#closeIssue: res: ', res)
  return res
}


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getBranches(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'branches', {}, accessToken)
  const branches = res.data
  debug().log('GitHub#getBranches: branches: ', branches)
  return branches
}


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getComments(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues/comments', {}, accessToken)
  const comments = res.data
  debug().log('GitHub#getComments: comments: ', comments)
  return comments
}


/**
 * @param {object} repository
 * @param {number} commentId
 * @param {string} [accessToken]
 * @return {object}
 */
export async function getComment(repository, commentId, accessToken = '') {
  assertDefined(...arguments)
  const comment = await getGitHub(repository, 'issues/comments/{commentId}', {commentId}, accessToken)
  debug().log('GitHub#getComment: comment: ', comment)
  return comment
}


/**
 * @param {object} repository
 * @param {string} commentId
 * @param {string} accessToken
 * @return {object}
 */
export async function deleteComment(repository, commentId, accessToken) {
  assertDefined(...arguments)
  return await deleteGitHub(repository, `issues/comments/{commentId}`, {commentId}, accessToken)
}


/**
 * The comments should have the following structure:
 *
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getIssueComments(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues/{issueNumber}/comments', {issueNumber}, accessToken)
  const comments = res.data
  debug().log('GitHub#getIssueComments: comments: ', comments)
  return comments
}


/**
 * Post issue to github
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {number} issueNumber
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken
 * @return {object}
 */
export async function createComment(repository, issueNumber, payload, accessToken) {
  assertDefined(...arguments)
  const args = {
    ...payload,
    issueNumber,
  }
  const res = await postGitHub(repository, `issues/{issueNumber}/comments`, args, accessToken)
  return res
}


/**
 * Retrieves the contents download URL for a GitHub repository path
 *
 * @param {object} repository
 * @param {string} path
 * @param {string} ref
 * @param {string} [accessToken]
 * @return {string}
 */
export async function getDownloadURL(repository, path, ref = '', accessToken = '') {
  assertDefined(...arguments)
  const args = {
    path: path,
    ref: ref,
  }
  if (accessToken) {
    args.headers = {
      'authorization': `Bearer ${accessToken}`,
      'if-modified-since': '',
      'if-none-match': '',
      ...args.headers,
    }
  }
  const contents = await getGitHub(repository, 'contents/{path}?ref={ref}', args)
  if (!contents || !contents.data || !contents.data.download_url || !contents.data.download_url.length > 0) {
    throw new Error('No contents returned from github')
  }
  return contents.data.download_url
}


/**
 * Retrieves organizations associated with the user
 *
 * @param {string} accessToken
 * @return {Promise} the list of organization
 */
export async function getOrganizations(accessToken) {
  assertDefined(accessToken)
  if (!accessToken || accessToken === '') {
    throw new Error('GitHub access token is required for this call')
  }

  const res = await octokit.request(`/user/orgs`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })

  return res.data
}


/**
 * Retrieves repositories associated with an organization
 *
 * @param {string} org
 * @param {string} [accessToken]
 * @return {Promise} the list of organization
 */
export async function getRepositories(org, accessToken = '') {
  assertDefined(...arguments)
  const res = await octokit.request('GET /orgs/{org}/repos', {
    org,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  return res.data
}

/**
 * Commits a file to a specified repository, path, and branch.
 *
 * This asynchronous function uploads and commits a file to a repository
 * owned by the specified owner, within the given path and branch. It optionally
 * uses an access token for authentication to perform the operation. The function
 * is designed to work with a backend service or worker capable of handling HTTP
 * requests to the repository's API (e.g., GitHub's API) for file commits.
 *
 * @param {string} owner The owner of the repository to which the file will be committed
 * @param {string} repo The name of the repository
 * @param {string} path The path within the repository where the file will be placed.
 * @param {Blob|File} file The file object to commit
 * @param {string} message The commit message
 * @param {string} branch The branch to which the commit will be made
 * @param {string} accessToken The access token for authentication
 * @return {string} newCommitSha
 */
export async function commitFile(owner, repo, path, file, message, branch, accessToken) {
  assertDefined(...arguments)

  // Create a new FileReader object
  const reader = new FileReader()

  // Convert the file to a Base64 string
  const contentPromise = new Promise((resolve, reject) => {
    reader.onload = () => {
      // Remove the prefix from the result (e.g., "data:text/plain;base64,") and resolve the Base64 encoded content
      resolve(reader.result.split(',')[1])
    }
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file) // Read the file
  })

  // base 64 content string
  const content = await contentPromise

  // Set the authorization headers for each octokit request
  const headers = {
    authorization: `Bearer ${accessToken}`,
  }

  // 1. Get the SHA of the latest commit on the branch
  const {data: refData} = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    headers,
  })
  const parentSha = refData.object.sha

  // 2. Get the SHA of the tree associated with the latest commit
  const {data: commitData} = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: parentSha,
    headers,
  })
  const treeSha = commitData.tree.sha

  // 3. Create a blob with your file content
  const {data: blobData} = await octokit.rest.git.createBlob({
    owner,
    repo,
    content,
    encoding: 'base64',
    headers,
  })
  const blobSha = blobData.sha

  // 4. Create a new tree with the base tree and the blob
  const {data: treeData} = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: treeSha,
    tree: [
      {
        path: path,
        mode: '100644', // file mode; 100644 for normal file, 100755 for executable, 040000 for subdirectory
        type: 'blob',
        sha: blobSha,
      },
    ],
    headers,
  })
  const newTreeSha = treeData.sha

  // 5. Create a new commit
  const {data: newCommitData} = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTreeSha,
    parents: [parentSha],
    headers,
  })
  const newCommitSha = newCommitData.sha

  // 6. Update the reference of your branch to point to the new commit
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommitSha,
    headers,
  })

  return newCommitSha
}

/**
 * Deletes a file from a specified repository and branch.
 *
 * This asynchronous function sends a request to delete a file located at a specified
 * path within a repository owned by a specified owner and branch. It uses an access token
 * for authentication. The function assumes the existence of a worker or an API endpoint
 * capable of handling the deletion process. It is essential to ensure that the access
 * token has appropriate permissions for this operation.
 *
 * @param {string} owner The owner of the repository from which the file will be deleted
 * @param {string} repo The name of the repository
 * @param {string} path The path to the file within the repository
 * @param {string} message The commit message associated with the file deletion
 * @param {string} branch The branch from which the file will be deleted
 * @param {string} accessToken The access token used for authentication
 * @return {string} newCommitSha
 */
export async function deleteFile(owner, repo, path, message, branch, accessToken) {
  assertDefined(...arguments)

  // Set the authorization headers for each octokit request
  const headers = {
    authorization: `Bearer ${accessToken}`,
  }

  // 1. Get the SHA of the latest commit on the branch
  const {data: refData} = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    headers,
  })
  const parentSha = refData.object.sha

  // 2. Get the SHA of the tree associated with the latest commit
  const {data: commitData} = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: parentSha,
    headers,
  })
  const baseTreeSha = commitData.tree.sha

  // 3. Create a new tree that omits the file (essentially, delete the file)
  const {data: newTreeData} = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [{
      path: path,
      mode: '100644', // file mode for a blob (file)
      type: 'blob',
      sha: null, // setting SHA to null will remove the file
    }],
    headers,
  })
  const newTreeSha = newTreeData.sha

  // 4. Create a new commit pointing to the new tree
  const {data: newCommitData} = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTreeSha,
    parents: [parentSha], // parent commit to keep the history
    headers,
  })
  const newCommitSha = newCommitData.sha

  // 5. Update the reference of your branch to point to the new commit
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommitSha,
    force: true, // Optional: to force update the reference, be cautious with this
    headers,
  })

  return newCommitSha
}


/**
 * Retrieves repositories associated with the authenticated user
 *
 * @param {string} [accessToken]
 * @return {Promise} the list of repositories
 */
export async function getUserRepositories(accessToken = '', org = '') {
  if ((accessToken === null || '') && (org === null || org === '') ) {
    throw new Error('One of accessToken or org must be valid')
  }
  let allRepos = []
  let page = 1
  let isDone = false
  const perPage = 100 // Max value is 100

  while (!isDone) {
    const res = await octokit.request('GET /user/repos', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      type: 'all',
      per_page: perPage,
      page: page,
    })

    // Filter out forks from the current page of results

    if (org === '') {
      const nonForkRepos = res.data.filter((repo) => !repo.fork)
      allRepos = allRepos.concat(nonForkRepos)
    } else {
      const nonForkRepos = res.data.filter((repo) => !repo.fork && repo.owner.login === org)
      allRepos = allRepos.concat(nonForkRepos)
    }

    if (res.data.length < perPage) {
      // If the number of repositories is less than 'perPage', it means we are on the last page
      isDone = true
      break
    }
    page++ // Go to the next page
  }

  return allRepos
}


/**
 * Retrieves files associated with a repository
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} [accessToken]
 * @return {Promise} the list of files in the repo
 */
export async function getFiles(owner, repo, accessToken = '') {
  assertDefined(...arguments)
  const res = await octokit.request('/repos/{owner}/{repo}/contents', {
    owner,
    repo,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })

  return res.data
}

/**
 * Retrieves files and folders associated with a repository
 *
 * @param {string} [accessToken]
 * @return {Promise} the list files and folders in the repo
 */
export async function getFilesAndFolders(repo, owner, subfolder = '', accessToken = '') {
  assertDefined(...arguments)
  const res = await octokit.request('/repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path: (subfolder === '' || subfolder === '/') ? null : subfolder, // Add the subfolder path here
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })

  const files = []
  const directories = []

  res.data.forEach((item) => {
    if (item.type === 'file') {
      files.push(item)
    } else if (item.type === 'dir') {
      directories.push(item)
    }
  })

  return {files, directories}
}

/**
 * Gets the latest commit hash for a github filepath
 *
 * @param {*} owner
 * @param {*} repo
 * @param {*} filePath
 * @param {*} accessToken
 * @param {*} branch
 * @return {string} latestCommitHash
 */
export async function getLatestCommitHash(owner, repo, filePath, accessToken, branch = 'main') {
  try {
    assertDefined(...arguments)
    let commits = null
    const requestOptions = {
      path: filePath,
      headers: {},
    }

    // Add the authorization header if accessToken is provided
    if (accessToken !== '') {
      requestOptions.headers.authorization = `Bearer ${accessToken}`
    }

    // Add the branch (sha) to the request if provided
    if (branch && branch !== '') {
      requestOptions.sha = branch
    }

    commits = await octokit.request(`GET /repos/${owner}/${repo}/commits`, requestOptions)

    if (commits.data.length === 0) {
      debug().warn('No commits found for the specified file.')
      return null
    }

    const latestCommitHash = commits.data[0].sha
    debug().log(`The latest commit hash for the file is: ${latestCommitHash}`)
    return latestCommitHash
  } catch (error) {
    debug().error('Error fetching the latest commit hash: ', error)
    return null
  }
}


/**
 * Parses a github repository url and returns a structure
 *
 * @param {string} githubUrl
 * @return {object} A repository path object
 */
export const parseGitHubRepositoryURL = (githubUrl) => {
  assertDefined(githubUrl)
  if (githubUrl.indexOf('://') === -1) {
    throw new Error('URL must be fully qualified and contain scheme')
  }
  const url = new URL(githubUrl)
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
 * Fetch the resource at the given path from GitHub, substituting in the given args
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args to substitute
 * @return {object} The object at the resource
 */
async function getGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
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
async function postGitHub(repository, path, args = {}, accessToken = '') {
  debug().log('GitHub#postGitHub: args: ', args)
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
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
async function deleteGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
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
async function patchGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  debug().log('Dispatching GitHub request for repo:', repository)
  const res = await octokit.request(`PATCH /repos/${repository.orgName}/${repository.name}/${path}`, {
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
      body: `Test Comment 1`,
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
      body: `Test Comment 2`,
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

export const MOCK_COMMITS = [{
  sha: 'testsha',
  node_id: 'C_kwDOIC6VB9oAKDg5OGViYzQ0MGFhNjBjOGQ3ZTcwNGJlYWQ2MzM0MjQwMGE1NjdiOWM',
  commit: {
    author: {
      name: 'User1',
      email: '74647806+User1@users.noreply.github.com',
      date: '2022-09-22T10:30:27Z',
    },
    committer: {
      name: 'GitHub',
      email: 'noreply@github.com',
      date: '2022-09-22T10:30:27Z',
    },
    message: 'First Commit',
    tree: {
      sha: '123',
      url: 'https://api.github.com/repos/user2/Momentum-Public/git/trees/ab6f0517905f88b158c05fbb7578c34c239fba9b',
    },
    url: 'https://api.github.com/repos/user2/Momentum-Public/git/commits/898ebc440aa60c8d7e704bead63342400a567b9c',
    comment_count: 0,
    verification: {
      verified: true,
      reason: 'valid',
      signature: '-----BEGIN PGP SIGNATURE-----\n\nwsBcBAABCAAQBQJjLDlDCRBK7hj4Ov3rIwA',
      payload: 'tree ab6f0517905f88b158c05fbb7578c34c239fba9b\nparent d945df4e3a58247aa357e07b8438e5860ffbf7',
    },
  },
  url: 'https://api.github.com/repos/user2/Momentum-Public/commits/898ebc440aa60c8d7e704bead63342400a567b9c',
  html_url: 'https://github.com/user2/Momentum-Public/commit/898ebc440aa60c8d7e704bead63342400a567b9c',
  comments_url: 'https://api.github.com/repos/user2/Momentum-Public/commits',
  author: {
    login: 'User1',
    id: 74647806,
    node_id: 'MDQ6VXNlcjc0NjQ3ODA2',
    avatar_url: 'https://avatars.githubusercontent.com/u/74647806?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/User1',
    html_url: 'https://github.com/User1',
    followers_url: 'https://api.github.com/users/User1/followers',
    following_url: 'https://api.github.com/users/User1/following{/other_user}',
    gists_url: 'https://api.github.com/users/User1/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/User1/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/User1/subscriptions',
    organizations_url: 'https://api.github.com/users/User1/orgs',
    repos_url: 'https://api.github.com/users/User1/repos',
    events_url: 'https://api.github.com/users/User1/events{/privacy}',
    received_events_url: 'https://api.github.com/users/User1/received_events',
    type: 'User',
    site_admin: false,
  },
  committer: {
    login: 'web-flow',
    id: 19864447,
    node_id: 'MDQ6VXNlcjE5ODY0NDQ3',
    avatar_url: 'https://avatars.githubusercontent.com/u/19864447?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/web-flow',
    html_url: 'https://github.com/web-flow',
    followers_url: 'https://api.github.com/users/web-flow/followers',
    following_url: 'https://api.github.com/users/web-flow/following{/other_user}',
    gists_url: 'https://api.github.com/users/web-flow/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/web-flow/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/web-flow/subscriptions',
    organizations_url: 'https://api.github.com/users/web-flow/orgs',
    repos_url: 'https://api.github.com/users/web-flow/repos',
    events_url: 'https://api.github.com/users/web-flow/events{/privacy}',
    received_events_url: 'https://api.github.com/users/web-flow/received_events',
    type: 'User',
    site_admin: false,
  },
  parents: [
    {
      sha: '123',
      url: 'https://api.github.com/repos/user2/Momentum-Public/commits/d945df4e3a58247aa357e07b8438e5860ffbf7e6',
      html_url: 'https://github.com/user2/Momentum-Public/commit/d945df4e3a58247aa357e07b8438e5860ffbf7e6',
    },
  ],
},
{
  sha: '123',
  node_id: 'C_kwDOIC6VB9oAKDg5OGViYzQ0MGFhNjBjOGQ3ZTcwNGJlYWQ2MzM0MjQwMGE1NjdiOWM',
  commit: {
    author: {
      name: 'User1',
      email: '74647806+User1@users.noreply.github.com',
      date: '2022-09-22T10:30:27Z',
    },
    committer: {
      name: 'GitHub',
      email: 'noreply@github.com',
      date: '2022-09-22T10:30:27Z',
    },
    message: 'Second Commit',
    tree: {
      sha: '123',
      url: 'https://api.github.com/repos/user2/Momentum-Public/git/trees/ab6f0517905f88b158c05fbb7578c34c239fba9b',
    },
    url: 'https://api.github.com/repos/user2/Momentum-Public/git/commits/898ebc440aa60c8d7e704bead63342400a567b9c',
    comment_count: 0,
    verification: {
      verified: true,
      reason: 'valid',
      signature: '-----BEGIN PGP SIGNATURE-----\n\nwsBcBAABCAAQBQJjLDlDCRBK7hj4Ov3rIwA',
      payload: 'tree ab6f0517905f88b158c05fbb7578c34c239fba9b\nparent d945df4e3a58247aa357e07b8438e5860ffbf7',
    },
  },
  url: 'https://api.github.com/repos/user2/Momentum-Public/commits/898ebc440aa60c8d7e704bead63342400a567b9c',
  html_url: 'https://github.com/user2/Momentum-Public/commit/898ebc440aa60c8d7e704bead63342400a567b9c',
  comments_url: 'https://api.github.com/repos/user2/Momentum-Public/commits',
  author: {
    login: 'User1',
    id: 74647806,
    node_id: 'MDQ6VXNlcjc0NjQ3ODA2',
    avatar_url: 'https://avatars.githubusercontent.com/u/74647806?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/User1',
    html_url: 'https://github.com/User1',
    followers_url: 'https://api.github.com/users/User1/followers',
    following_url: 'https://api.github.com/users/User1/following{/other_user}',
    gists_url: 'https://api.github.com/users/User1/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/User1/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/User1/subscriptions',
    organizations_url: 'https://api.github.com/users/User1/orgs',
    repos_url: 'https://api.github.com/users/User1/repos',
    events_url: 'https://api.github.com/users/User1/events{/privacy}',
    received_events_url: 'https://api.github.com/users/User1/received_events',
    type: 'User',
    site_admin: false,
  },
  committer: {
    login: 'web-flow',
    id: 19864447,
    node_id: 'MDQ6VXNlcjE5ODY0NDQ3',
    avatar_url: 'https://avatars.githubusercontent.com/u/19864447?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/web-flow',
    html_url: 'https://github.com/web-flow',
    followers_url: 'https://api.github.com/users/web-flow/followers',
    following_url: 'https://api.github.com/users/web-flow/following{/other_user}',
    gists_url: 'https://api.github.com/users/web-flow/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/web-flow/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/web-flow/subscriptions',
    organizations_url: 'https://api.github.com/users/web-flow/orgs',
    repos_url: 'https://api.github.com/users/web-flow/repos',
    events_url: 'https://api.github.com/users/web-flow/events{/privacy}',
    received_events_url: 'https://api.github.com/users/web-flow/received_events',
    type: 'User',
    site_admin: false,
  },
  parents: [
    {
      sha: '123',
      url: 'https://api.github.com/repos/user2/Momentum-Public/commits/d945df4e3a58247aa357e07b8438e5860ffbf7e6',
      html_url: 'https://github.com/user2/Momentum-Public/commit/d945df4e3a58247aa357e07b8438e5860ffbf7e6',
    },
  ],
},
]

export const MOCK_BRANCHES = {
  data: [
    {
      name: 'Version-1',
      commit: {
        sha: '123',
        url: 'https://api.github.com/repos/user2/Seestrasse-Public/commits/f51a6f2fd087d7562c4a63edbcff0b3a2b4226a7',
      },
      protected: false,
    },
    {
      name: 'main',
      commit: {
        sha: '456',
        url: 'https://api.github.com/repos/user2/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0',
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
        sha: '456',
        url: 'https://api.github.com/repos/user2/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0',
      },
      protected: false,
    },
  ],
}

export const MOCK_ISSUES_EMPTY = {data: []}

export const MOCK_MODEL_PATH_GIT = {
  org: 'user2',
  repo: 'Schneestock-Public',
  branch: 'main',
  filepath: '/ZGRAGGEN.ifc',
  eltPath: '',
  gitpath: 'https://raw.githubusercontent.com/user2/Schneestock-Public/main/ZGRAGGEN.ifc',
}

export const MOCK_MODEL_PATH_LOCAL = {
  filepath: '/4f080237-b4e4-4ede-8885-d498647f15e6.ifc',
  eltPath: '',
}

export const MOCK_ORGANIZATION = {
  login: 'bldrs-ai',
  id: 78882658,
  node_id: 'MDEyOk9yZ2FuaXphdGlvbjc4ODgyNjU4',
  url: 'https://api.github.com/orgs/bldrs-ai',
  repos_url: 'https://api.github.com/orgs/bldrs-ai/repos',
  events_url: 'https://api.github.com/orgs/bldrs-ai/events',
  hooks_url: 'https://api.github.com/orgs/bldrs-ai/hooks',
  issues_url: 'https://api.github.com/orgs/bldrs-ai/issues',
  members_url: 'https://api.github.com/orgs/bldrs-ai/members{/member}',
  public_members_url: 'https://api.github.com/orgs/bldrs-ai/public_members{/member}',
  avatar_url: 'https://avatars.githubusercontent.com/u/78882658?v=4',
  description: 'Build. Every. Thing. Together.',
}

export const MOCK_ORGANIZATIONS = {
  data: [
    MOCK_ORGANIZATION,
  ],
}

export const MOCK_REPOSITORY = {
  id: 337879836,
  node_id: 'MDEwOlJlcG9zaXRvcnkzMzc4Nzk4MzY=',
  name: 'Share',
  full_name: 'bldrs-ai/Share',
  private: true,
}

export const MOCK_FILES = [{
  name: 'window.ifc',
  path: 'window.ifc',
  sha: '987',
  size: 7299,
  url: 'https://api.github.com/repos/bldrs-ai/Share/contents/window.ifc?ref=main',
  html_url: 'https://github.com/bldrs-ai/Share/blob/main/window.ifc',
  git_url: 'https://api.github.com/repos/bldrs-ai/Share/git/blobs/7fa3f2212cc4ea91a6539dd5f185a986574f4cd6',
  download_url: 'https://raw.githubusercontent.com/bldrs-ai/Share/main/window.ifc',
  type: 'file',
},
{
  name: 'folder',
  path: 'folder',
  sha: '7fa3f2212cc4ea91a6539dd5f185a986574f4cd7',
  size: 0,
  url: 'https://api.github.com/test/folder',
  html_url: '',
  git_url: 'https://api.github.com/test/7fa3f2212cc4ea91a6539dd5f185a986574f4cd7',
  download_url: 'https://raw.githubusercontent.com/test/folder',
  type: 'dir',
}]


// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
const octokit = new Octokit({
  baseUrl: process.env.GITHUB_BASE_URL,
  userAgent: `bldrs/${PkgJson.version}`,
  // This comment instructs GitHub to always use the latest response instead of using a cached version. Especially relevant for notee.
  // https://github.com/octokit/octokit.js/issues/890#issuecomment-392193948 the source of the solution
  headers: {
    'If-None-Match': '',
  },
})
