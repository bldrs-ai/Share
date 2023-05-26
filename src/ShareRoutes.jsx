import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import debug from './utils/debug'
import {disablePageReloadApprovalCheck} from './utils/event'
import About from './pages/share/About'
import Conway from './pages/share/Conway'
import Share from './Share'


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
        <Route path='about' element={<About/>}/>
        <Route path='about/conway' element={<Conway/>}/>
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
          navigate(`${appPrefix}/v/new/${localBlobUrl}.ifc`)
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
      disablePageReloadApprovalCheck()
      navigate(dest)
    }
  }, [location, appPrefix, navigate])

  return <Outlet/>
}
