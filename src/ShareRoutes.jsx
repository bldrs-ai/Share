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
      </Route>
    </Routes>
  )
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
