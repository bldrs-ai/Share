import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import debug from './utils/debug'
import {assertDefined} from './utils/assert'
import {handleBeforeUnload} from './utils/event'
import Share from './Share'
import {pathSuffixSupported} from './Filetype'


/**
 * For URL design see: https://github.com/bldrs-ai/Share/wiki/URL-Structure
 *
 * A new model path will cause a new instance of CadView to be
 * instantiated.  CadView will invoke the model loader and creates a
 * THREE.Scene.  This scene is currently not re-used
 *
 * For example, a first page load of:
 *
 *   .../v/p/haus.ifc
 *
 * will load a new instance of CadView for that path.  Changing the path to:
 *
 *   .../v/p/index.ifc
 *
 * will load a second new instance fot that path.
 *
 * Examples for this component:
 *   http://host/share/v/p/haus.ifc
 *   http://host/share/v/gh/IFCjs/test-ifc-files/main/Others/479l7.ifc
 *                    ^... here on handled by this component's paths.
 *              ^... path to the component in BaseRoutes.jsx.
 *
 * @see https://github.com/bldrs-ai/Share/wiki/Design#ifc-scene-load
 * @return {object}
 */
export default function ShareRoutes({installPrefix, appPrefix}) {
  return (
    <Routes>
      <Route path='/' element={<Forward appPrefix={appPrefix}/>}>
        <Route
          path='v/new/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={`${appPrefix}/v/new`}
            />
          }
        />
        <Route
          path='v/p/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={`${appPrefix}/v/p`}
            />
          }
        />
        <Route
          path='v/gh/:org/:repo/:branch/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={`${appPrefix}/v/gh`}
            />
          }
        />
        <Route
          path='v/src/*'
          element={
            <FetchFromUrl appPrefix={appPrefix}/>
          }
        />
      </Route>
    </Routes>
  )
}

/**
 * Fetches an IFC file from a remote URL (https only) and then loads it as a local file.
 *
 * Example:
 * A file located at https://example.org/pathto/myfile.ifc can be loaded into Bldrs via
 * the following URL http://bldrs.ai/share/v/src/example.org%2Fpathto%2Fmyfile.ifc
 *
 * @param {string} appPrefix e.g. /share is the prefix for this component.
 * @return {(null)}
 */
function FetchFromUrl({appPrefix}) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchFromUrlAndRedirect = async () => {
      const locationParts = location.pathname.split('/')
      const srcIndex = locationParts.indexOf('src')
      if (srcIndex >= 0) {
        const urlIndex = srcIndex + 1
        if (urlIndex < locationParts.length) {
          const encodedUrl = locationParts.slice(urlIndex).join('/')
          const decodedUrl = decodeURIComponent(encodedUrl)
          const fullUrl = `//${decodedUrl}`
          const fetchResponse = await fetch(fullUrl)
          const blob = await fetchResponse.blob()

          let localBlobUrl = URL.createObjectURL(blob)
          const parts = localBlobUrl.split('/')
          localBlobUrl = parts[parts.length - 1]

          window.removeEventListener('beforeunload', handleBeforeUnload)
          navigate(`${appPrefix}/v/new/${btoa(encodedUrl)}/${localBlobUrl}.ifc`)
        }
      }
    }
    fetchFromUrlAndRedirect()
  })

  return (null)
}


/**
 * Forward page from /share to /share/v/p per spect at:
 *   https://github.com/bldrs-ai/Share/wiki/URL-Structure
 *
 * @param {string} appPrefix The install prefix, e.g. /share.
 * @return {object}
 */
function Forward({appPrefix}) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.pathname === appPrefix) {
      const dest = `${appPrefix}/v/p`
      debug().log('ShareRoutes#useEffect[location]: forwarding to: ', dest)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      navigate(dest)
    }
  }, [location, appPrefix, navigate])

  return <Outlet/>
}


/**
 * Check if input is a url
 *
 * @param {input} input
 * @return {boolean} return true if url is found
 */
export function looksLikeLink(input) {
  assertDefined(input)
  return pathSuffixSupported(input) && (
    input.startsWith('http') ||
      input.startsWith('/') ||
      input.startsWith('bldrs') ||
      input.startsWith('github') ||
      input.startsWith('localhost'))
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


// Functions below exported only for testing.
/**
 * Look for any obvious problems with the given url.
 *
 * @param {object} urlStr
 * @return {boolean} return true if url is found
 * @throws Error if the argument have path slash '/' characters after
 * trimming host and appinstal prefix.
 * @private
 */
export function trimToPath(urlStr) {
  assertDefined(urlStr)
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


/** Named capture groups for a GitHub URL's path parts. */
const pathParts = [
  '(?<org>[^/]+)',
  '(?<repo>[^/]+)',
  '(?:(?<isBlob>blob)/)?(?<branch>[^/]+)',
  '(?<file>.+)',
]


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
  if (match) {
    const {groups: {org, repo, branch, file}} = match
    return `/${org}/${repo}/${branch}/${file}`
  }
  throw new Error(`Expected a multi-part file path: ${urlWithPath}`)
}
