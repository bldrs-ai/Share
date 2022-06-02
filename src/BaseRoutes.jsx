import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'
import debug from './utils/debug'


export const INSTALL_PATH = '/private'


/**
 * From URL design: https://github.com/bldrs-ai/Share/wiki/URL-Structure
 * ... We adopt a URL structure similar to Google Apps URL structure:
 *
 *   http://host/<app>/<view>/<object>
 *
 * which when fully expanded becomes:
 *
 *   http://host/share/v/p/indec.ifc
 *   http://host/share/v/gh/bldrs-ai/Share/main/public/index.ifc
 *
 * @param {testElt} For unit test allow use of a stub here instead of loading the app.
 * @return {Object}
 */
export default function BaseRoutes({testElt = null}) {
  const location = useLocation()
  const navigate = useNavigate()
  const installPrefix = window.location.pathname.startsWith(INSTALL_PATH) ? INSTALL_PATH : ''

  useEffect(() => {
    if (location.pathname === installPrefix ||
        location.pathname === (installPrefix + '/')) {
      debug().log('BaseRoutes#useEffect[], forwarding to: ', installPrefix + '/share')
      navigate(installPrefix + '/share')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const basePath = installPrefix + '/'
  return (
    <Routes>
      <Route path={basePath} element={<Outlet/>}>
        <Route
          path="share/*"
          element={
            testElt ||
              <ShareRoutes
                installPrefix={installPrefix}
                appPrefix={installPrefix + '/share'} />
          }/>
      </Route>
    </Routes>
  )
}
