import {assertDefined} from '../../utils/assert'
import {pathSuffixSupported} from '../../Filetype'


/** Named capture groups for a GitHub URL's path parts. */
const pathParts = [
  '(?<org>[^/]+)',
  '(?<repo>[^/]+)',
  '(?:(?<isBlob>blob|raw|tree)/)?(?<branch>[^/]+)',
  '(?<file>.+)',
]


/**
 * Parses a github repository url and returns a structure
 *
 * @param {string} githubUrl
 * @return {object} A repository path object
 */
export const parseGitHubRepositoryUrl = (githubUrl) => {
  assertDefined(githubUrl)
  if (githubUrl.indexOf('://') === -1) {
    throw new Error('URL must be fully qualified and contain scheme')
  }
  const url = new URL(githubUrl)
  const host = url.host.toLowerCase()
  if (host !== 'github.com' && host !== 'raw.githubusercontent.com') {
    throw new Error('Not a valid GitHub repository URL')
  }
  const match = url.pathname.match(`^/${pathParts.join('/')}$`)
  if (match === null || !match.groups) {
    throw new Error('Could not match GitHub repository URL')
  }
  const {org, repo, branch, file} = match.groups
  return {
    url: url,
    owner: org,
    repository: repo,
    ref: branch,
    path: file,
  }
}


// TODO(pablo): this is pretty ad-hoc.  Could be unified with MimeType
// parsing.
/**
 * Matches strings like '/org/repo/branch/dir1/dir2/file.(ifc|obj)'
 * with an optional host prefix.
 */
const re = new RegExp(`^/${pathParts.join('/')}$`)


/**
 * Convert a Github repository URL or partial path to a Share path
 * rooted at an organization.
 *
 * @param {string} urlWithPath
 * @return {string} Structured path to the model repository
 * @throws Error if the argument doesn't match the path pattern.
 * @private
 */
export function extractOrgPrefixedPath(urlWithPath) {
  const match = re.exec(urlWithPath) // TODO actually handle
  if (match && match.groups) {
    const {org, repo, branch, file} = match.groups
    return `/${org}/${repo}/${branch}/${file}`
  }
  throw new Error(`Expected a multi-part file path: ${urlWithPath}`)
}


/**
 * @param {string} urlWithPath
 * @return {string} Structured path to the model repository
 * @throws Error if the argument doesn't match the path pattern.
 */
export function githubUrlOrPathToSharePath(urlWithPath) {
  const orgRepoPath = extractOrgPrefixedPath(trimToPath(urlWithPath))
  return `/share/v/gh${orgRepoPath}`
}


/**
 * Check if input is a url
 *
 * @param {string} input
 * @return {boolean} return true if url is found
 */
export function looksLikeLink(input) {
  assertDefined(input)
  return typeof input === 'string' && pathSuffixSupported(input) && (
    input.startsWith('http') ||
      input.startsWith('/') ||
      input.startsWith('bldrs') ||
      input.startsWith('github') ||
      input.startsWith('localhost'))
}


// Functions below exported only for testing.
/**
 * Look for any obvious problems with the given url.
 *
 * @param {string} urlStr
 * @return {string} The trimmed path
 * @throws Error if the argument have path slash '/' characters after
 * trimming host and appinstal prefix.
 * @private
 */
export function trimToPath(urlStr) {
  assertDefined(urlStr)
  if (typeof urlStr !== 'string') {
    throw new Error('urlStr must be a string')
  }
  let s = urlStr.trim()
  if (s.startsWith('http://')) {
    s = s.substring('http://'.length)
  } else if (s.startsWith('https://')) {
    s = s.substring('https://'.length)
  }
  // Allow use of links like bldrs.ai/share/v/gh and localhost:8080/share/v/gh
  const sharePathNdx = s.indexOf('share/v/gh')
  if (sharePathNdx > 0) {
    s = s.substring(sharePathNdx + 'share/v/gh'.length)
  }
  const firstSlashNdx = s.indexOf('/')
  if (firstSlashNdx === -1) {
    throw new Error(`Expected at least one slash for file path: ${urlStr}`)
  }
  return s.substring(firstSlashNdx)
}
