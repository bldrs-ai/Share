import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {assertDefined} from './utils/assert'
import Share from './Share'
import debug from './utils/debug'


/**
 * For URL design see: https://github.com/bldrs-ai/Share/wiki/URL-Structure
 *
 * A new model path will cause a new instance of CadView to be
 * instantiated, including a new IFC.js viewer.  Thus, each model has
 * its own IFC.js/three.js context.
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
 * @return {Object}
 */
export default function ShareRoutes({installPrefix, appPrefix}) {
  return (
    <Routes>
      <Route path='/' element={<Forward appPrefix={appPrefix} />}>
        <Route
          path='v/new/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={appPrefix + '/v/new'}
            />
          }
        />
        <Route
          path='v/p/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={appPrefix + '/v/p'}
            />
          }
        />
        <Route
          path='v/gh/:org/:repo/:branch/*'
          element={
            <Share
              installPrefix={installPrefix}
              appPrefix={appPrefix}
              pathPrefix={appPrefix + '/v/gh'}
            />
          }
        />
      </Route>
    </Routes>
  )
}


/**
 * Forward page from /share to /share/v/p per spect at:
 *   https://github.com/bldrs-ai/Share/wiki/URL-Structure
 * @param {string} appPrefix The install prefix, e.g. /share.
 * @return {Object}
 */
function Forward({appPrefix}) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.pathname == appPrefix) {
      const dest = appPrefix + '/v/p'
      debug().log('ShareRoutes#useEffect[location]: forwarding to: ', dest)
      navigate(dest)
    }
  }, [location, appPrefix, navigate])

  return <Outlet />
}


/**
 * Check if input is a url
 * @param {input} input
 * @return {boolean} return true if url is found
 */
export function isUrl(input) {
  assertDefined(input)
  return input.startsWith('https://') || input.includes('www')
}


/**
 * Look for any obvious problems with the given url.
 * @param {Object} urlStr
 * @return {boolean} return true if url is found
 */
export function urlLooksValid(urlStr) {
  assertDefined(urlStr)
  let url
  try {
    url = new URL(urlStr)
  } catch (e) {
    return false
  }
  switch (url.hostname) {
    case 'github.com':
    case 'www.github.com':
    case 'raw.githubusercontent.com':
      return true
  }
  return false
}


/** Named capture groups for a GitHub URL's path parts. */
const pathParts = [
  '(?<org>[^/]+)',
  '(?<repo>[^/]+)',
  '(?:(?<isBlob>blob)/)?(?<branch>[^/]+)',
  '(?<file>.+)',
]


/** Matches strings like '/org/repo/branch/dir1/dir2/file.ifc' */
const re = new RegExp(`^/${pathParts.join('/')}$`)


/**
 * Convert a Github repository URL or partial path to a Share path
 * rooted at an organization.
 * @param {string} urlOrPath
 * @return {string} Structured path to the model repository
 */
export function extractOrgPrefixedPath(urlOrPath) {
  const match = re.exec(urlOrPath.split('.com')[1]) // TODO actually handle
  if (match) {
    const {groups: {org, repo, branch, file}} = match
    return `/${org}/${repo}/${branch}/${file}`
  }
  return ''
}


/**
 * @param {string} urlOrPath
 * @return {string} Structured path to the model repository
 */
export function githubUrlOrPathToSharePath(urlOrPath) {
  return '/share/v/gh' + extractOrgPrefixedPath(urlOrPath)
}
