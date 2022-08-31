import React, {useEffect, useRef} from 'react'
import {Outlet, Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import ShareRoutes from './ShareRoutes'
import debug from './utils/debug'


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
 * @see https://github.com/bldrs-ai/Share/wiki/Design#ifc-scene-load
 * @param {testElt} For unit test allow use of a stub here instead of loading the app.
 * @return {Object}
 */
export default function BaseRoutes({testElt = null}) {
  const location = useRef(useLocation())
  const navigation = useRef(useNavigate())
  const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : ''
  const basePath = `${installPrefix }/`

  useEffect(() => {
    if (location.current.pathname === installPrefix ||
        location.current.pathname === basePath) {
      debug().log('BaseRoutes#useEffect[], forwarding to: ', `${installPrefix }/share`)
      navigation.current(`${installPrefix }/share`)
    }
  }, [basePath, installPrefix, location, navigation])

  return (
    <Routes>
      <Route path={basePath} element={<Outlet/>}>
        <Route
          path="share/*"
          element={
            testElt ||
              <ShareRoutes
                installPrefix={installPrefix}
                appPrefix={`${installPrefix }/share`}
              />
          }
        />
      </Route>
    </Routes>
  )
}
