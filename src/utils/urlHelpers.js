/**
 * Validates if a string is a valid URL by attempting to create a URL object.
 *
 * @param {string} urlString - The string to validate as a URL
 * @return {boolean} - True if the string is a valid URL, false otherwise
 */
export function isValidUrl(urlString) {
  try {
    new URL(urlString)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Processes a Google Drive URL and returns the processed URL for CORS proxy.
 *
 * @param {string} filepath - The Google Drive URL to process
 * @return {string|null} - The processed URL or null if not a Google Drive URL
 */
export function processGoogleDriveUrl(filepath) {
  const googleDriveRegex = new RegExp('https://drive.google.com/file/d/(?<id>[^/]+)/view')
  const matchParts = googleDriveRegex.exec(filepath)

  if (!matchParts?.groups?.id) {
    return null
  }

  const googleFileId = matchParts.groups.id
  if (process.env.CORS_PROXY_HOST !== null) {
    // eg for localhost dev
    return `${process.env.CORS_PROXY_HOST}${process.env.CORS_PROXY_PATH}?id=${googleFileId}`
  } else {
    // prod
    return `${process.env.CORS_PROXY_PATH}?id=${googleFileId}`
  }
}

/**
 * Processes a URL filepath for external content, currently supporting Google Drive.
 *
 * @param {string} filepath - The URL to process
 * @return {object|null} - Object with srcUrl and gitpath, or null if invalid
 */
export function processExternalUrl(filepath) {
  if (!isValidUrl(filepath)) {
    return null
  }

  // For now, only support Google Drive files
  const processedUrl = processGoogleDriveUrl(filepath)
  if (processedUrl) {
    return {
      srcUrl: processedUrl,
      gitpath: 'external',
    }
  }

  // If not Google Drive, return the original URL
  return {
    srcUrl: filepath,
    gitpath: 'external',
  }
}

/**
 * Processes a project file path for local files (/new and /p pathPrefixes).
 *
 * @param {string} filepath - The file path to process
 * @param {string} eltPath - Optional element path
 * @return {object} - Object with filepath and eltPath
 */
export function processProjectFile(filepath, eltPath) {
  return {
    filepath,
    eltPath,
  }
}

/**
 * Processes a GitHub file path for remote repository files.
 *
 * @param {string} filepath - The file path within the repository
 * @param {string} eltPath - Optional element path
 * @param {object} urlParams - URL parameters containing org, repo, branch
 * @return {object} - Object with org, repo, branch, filepath, eltPath, and gitpath
 */
export function processGitHubFile(filepath, eltPath, urlParams) {
  const result = {
    org: urlParams['org'],
    repo: urlParams['repo'],
    branch: urlParams['branch'],
    filepath,
    eltPath,
  }
  result.getRepoPath = () => `/${result.org}/${result.repo}/${result.branch}${result.filepath}`
  result.gitpath = `https://github.com${result.getRepoPath()}`
  return result
}
