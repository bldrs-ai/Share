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
export function isURL(input) {
  assertDefined(input)
  return input.includes('https://') || input.includes('www')
}


/**
 * Check if input is a valid url
 * @param {Object} input
 * @return {boolean} return true if url is found
 */
export function isValidModelURL(input) {
  assertDefined(input)
  try {
    const url = new URL(input)
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com' &&
        parsed.hostname !== 'www.github.com' &&
        parsed.hostname !== 'raw.githubusercontent.com') {
      return false
    }
    return true
  } catch (e) {
    return false
  }
}


/**
 * ParseIfcURL parses Github repository URLs or raw content URLs
 * @param {string} url
 * @return {string} Structured path to the model repositore
 */
export const parseIfcURL = (url) => {
  assertDefined(url)
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/')
  switch (parsed.hostname) {
    case 'github.com':
    case 'www.github.com':
      if (parts.length > 4 || parts[3] === 'blob') {
        const URLParameters = {
          org: parts[1],
          repo: parts[2],
          branch: parts[4],
          path: parts[5],
        }
        const modelPath = `/share/v/gh/${URLParameters.org}/${URLParameters.repo}/${URLParameters.branch}/${URLParameters.path}`
        return modelPath
      }
      throw new Error('unsupported Github repository URL')
    case 'raw.githubusercontent.com':
      if (parts.length > 3) {
        const URLParameters = {
          org: parts[1],
          repo: parts[2],
          branch: parts[3],
          path: parts[4],
        }
        const modelPath = `/share/v/gh/${URLParameters.org}/${URLParameters.repo}/${URLParameters.branch}/${URLParameters.path}`
        return modelPath
      }
      throw new Error('unsupported Github user content URL')
    default:
      throw new Error('unexpected case!')
  }
}

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
