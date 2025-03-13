import {assertDefined} from '../../utils/assert'
import {octokit} from './OctokitExport'
import {getGitHub, getGitHubNoCache} from './Http' // TODO(pablo): don't use octokit directly
import {checkCache, updateCache} from './Cache'


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

  let cacheKey = `${owner}/${repo}/${path}/getRef`
  let cached = checkCache(cacheKey)

  // If we have a cached ETag, add If-None-Match header
  if (cached && cached.headers && cached.headers.etag) {
    headers['If-None-Match'] = cached.headers.get('etag')
  } else {
    headers['If-None-Match'] = ''
  }

  let refData
  try {
    const response = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      headers,
    })
    refData = response.data
    await updateCache(cacheKey, response)
  } catch (error) {
    const NOTMODIFIED = 304
    if (error.status === NOTMODIFIED && cached) {
      refData = cached
    } else {
      throw error
    }
  }

  const parentSha = refData.object.sha

  cacheKey = `${owner}/${repo}/${path}/getCommit`
  cached = await checkCache(cacheKey)

  if (cached && cached.headers && cached.headers.etag) {
    headers['If-None-Match'] = cached.headers.get('etag')
  } else {
    headers['If-None-Match'] = ''
  }

  let commitData
  try {
    // 2. Get the SHA of the tree associated with the latest commit
    const response = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
      headers,
    })
    commitData = response.data
    await updateCache(cacheKey, response)
  } catch (error) {
    const NOTMODIFIED = 304
    if (error.status === NOTMODIFIED && cached) {
      commitData = cached
    } else {
      throw error
    }
  }

  const treeSha = commitData.tree.sha

  // 3. Create a blob with your file content
  const blobData = await octokit.rest.git.createBlob({
    owner,
    repo,
    content,
    encoding: 'base64',
    headers,
  })
  const blobSha = blobData.data.sha

  // 4. Create a new tree with the base tree and the blob
  const treeData = await octokit.rest.git.createTree({
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
  const newTreeSha = treeData.data.sha

  // 5. Create a new commit
  const newCommitData = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTreeSha,
    parents: [parentSha],
    headers,
  })
  const newCommitSha = newCommitData.data.sha

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
 * Retrieves the contents download URL for a GitHub repository path
 *
 * @param {object} repository
 * @param {string} path
 * @param {string} ref
 * @param {string} [accessToken]
 * @return {string}
 */
export async function getDownloadUrl(repository, path, ref = '', accessToken = '') {
  assertDefined(...arguments)
  const args = {
    path: path,
    ref: ref,
  }

  const contents = await getGitHub(repository, 'contents/{path}?ref={ref}', args, accessToken)
  if (!contents || !contents.data || !contents.data.download_url || !contents.data.download_url.length > 0) {
    throw new Error('No contents returned from github')
  }

  return contents.data.download_url
}


/**
 * Gets the file or directory contents at the given repository's path.
 *
 * @param {string} repository
 * @param {string} path
 * @return {Array<string>} Pair of [downloadUrl, sha]
 */
export async function getPathContents(repository, path, ref = '', accessToken = '') {
  assertDefined(...arguments)
  const args = {
    path: path,
    ref: ref,
  }

  /**
   * Getting path contents is the primary step to get the download URL for a model. For private models,
   * the returned URL will have a temporary token attached to the URL as in:
   * https://media.githubusercontent.com/media/private_repo/index.ifc?token=ABCDE..
   * For small models, the content field of the response will include the file base64 encoded, but we
   * don't use that. We currently always use the download link. When we download the model from that
   * link, we get an ETAG and keep it, using it later to check If-Modified-Since.
   *
   * GitHub API uses the file hash for caching (ETAG), which conflicts with the one time use
   * download_url, so we need to request with no cache enabled here.
   */
  const contents = await getGitHubNoCache(repository, 'contents/{path}?ref={ref}', args, accessToken)
  if (!contents || !contents.data || !contents.data.download_url || !contents.data.download_url.length > 0) {
    throw new Error('No contents returned from github')
  }

  return [contents.data.download_url, contents.data.sha]
}


/**
 * Retrieves files associated with a repository
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} [accessToken]
 * @return {object} the list of files in the repo
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
 * @return {object} the list files and folders in the repo
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
