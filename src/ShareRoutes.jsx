import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
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
 * Check if input is a valid url
 * @param {Object} input
 * @return {boolean} return true if url is found
 */
export function isValidModelURL(input) {
  {/* eslint-disable-next-line */}
  const urlRegex = '((http|https)://)(www.)?' + '[a-zA-Z0-9@:%._\\+~#?&//=]{2,256}\\.[a-z]' + '{2,6}\\b([-a-zA-Z0-9@:%._\\+~#?&//=]*)'
  const isValid = input.match(urlRegex)
  if (isValid) {
    return true
  } else {
    return false
  }
}


/**
 * construct a valid path to the GitHUB model
 * @param {Object} input
 * @return {string} model URL
 */
export function constructModelURL(input) {
  const url = new URL(input)
  const URLParamtersArr = url.pathname.split('/')
  const URLParameters = {
    org: URLParamtersArr[1],
    repo: URLParamtersArr[2],
    branch: URLParamtersArr[4],
    fileName: URLParamtersArr[5],
  }
  {/* eslint-disable-next-line */}
  const modelPath = `/share/v/gh/${URLParameters.org}/${URLParameters.repo}/${URLParameters.branch}/${URLParameters.fileName}`
  return modelPath
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
