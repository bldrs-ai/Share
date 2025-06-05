import {assertDefined} from '../../utils/assert'
import {checkCache, updateCache} from './Cache'
import {getGitHub, getGitHubResource, HTTP_CREATED, HTTP_NOT_MODIFIED, HTTP_NOT_FOUND} from './Http'
import {octokit} from './OctokitExport'


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
 * @return {Promise<string>} A promise that resolves to the new commit SHA
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
  let cached = await checkCache(cacheKey)

  const addIfNoneMatchHeader = (headersObj, cachedObj) => {
    if (cachedObj && cachedObj.headers && cachedObj.headers.etag) {
      headersObj['If-None-Match'] = cachedObj.headers.etag
    } else {
      headersObj['If-None-Match'] = ''
    }
  }
  addIfNoneMatchHeader(headers, cached)

  let refData
  let response
  try {
    response = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      headers,
    })
    refData = response.data
    await updateCache(cacheKey, response)
  } catch (error) {
    if (error.status === HTTP_NOT_MODIFIED && cached) {
      refData = cached.data
    } else if (
      error.status === HTTP_NOT_FOUND &&
      error.message.includes('https://docs.github.com/rest/git/refs#get-a-reference')) {
      // If the branch doesn't exist, create it.
      // 1. Get the default branch
      let newRefResponse
      try {
        const repoInfo = await octokit.rest.repos.get({
          owner,
          repo,
          headers,
        })
        const defaultBranch = repoInfo.data.default_branch
        // 2. Get the latest commit on the default branch
        const baseRefResponse = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${defaultBranch}`,
          headers,
        })
        const baseSha = baseRefResponse.data.object.sha
        // 3. Create a new branch with the default branch as the base
        newRefResponse = await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branch}`, // must include "refs/"
          sha: baseSha,
          headers,
        })

        if (newRefResponse.status !== HTTP_CREATED) {
          throw new Error('Failed to create new branch')
        }
      } catch (err) {
        throw new Error(`Failed to create branch: ${err.message}`)
      }

      refData = newRefResponse.data
      await updateCache(cacheKey, newRefResponse)
    } else {
      throw error
    }
  }

  if (!refData || !refData.object || !refData.object.sha) {
    throw new Error('Failed to get or create branch reference')
  }

  const parentSha = refData.object.sha

  cacheKey = `${owner}/${repo}/${path}/getCommit`
  cached = await checkCache(cacheKey)

  addIfNoneMatchHeader(headers, cached)

  let commitData
  try {
    // 2. Get the SHA of the tree associated with the latest commit
    response = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
      headers,
    })
    commitData = response.data
    await updateCache(cacheKey, response)
  } catch (error) {
    if (error.status === HTTP_NOT_MODIFIED && cached) {
      commitData = cached.data
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
 * @param {boolean} useCache
 * @return {Array<string>} [downloadUrl, sha, isCacheHit]
 */
export async function getPathContents(repository, path, useCache, ref = '', accessToken = '') {
  assertDefined(...arguments)
  const args = {path, ref}

  const {response, isCacheHit} = await getGitHubResource(
    repository,
    'contents/{path}?ref={ref}',
    args,
    useCache,
    accessToken,
  )

  // Validate the response
  if (!response || !response.data || !response.data.download_url || response.data.download_url.length === 0) {
    throw new Error('No contents returned from GitHub')
  }

  // Check if the download_url is a raw GitHub URL and if the base64 content is available
  const result = {
    sha: response.data.sha,
    isCacheHit,
    isBase64: false,
    content: response.data.download_url, // default to the download URL
  }

  if (
    response.data.download_url.includes('raw.githubusercontent.com') &&
    response.data.content // ensures content is not null/undefined/empty
  ) {
    // If the file content is available in base64,
    // return it along with a flag indicating that it's base64 encoded.
    result.content = response.data.content
    result.isBase64 = true
  }

  return result
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
