import React, {useEffect} from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {Auth0Provider} from '@auth0/auth0-react'
import ShareRoutes from './ShareRoutes'
import debug from './utils/debug'


// Enable when we build app in GitHub actions.
// import {OAUTH_DOMAIN, OAUTH_CLIENT_ID} from 'env'

// Localhost app:
// const OAUTH_CLIENT_ID = 'VGCcKJAno1y8RMbf1L7hZ4shLQCJ9nSp'

// Auth0: Main Bldrs.ai GHP app
export const OAUTH_CLIENT_ID = 'xojbbSyJ9n6HUdZwE7LUX7Zvff6ejxjv'

// Auth0: pablo-mayrgundter/Share
// export const OAUTH_CLIENT_ID = 'xIGABT7wbAA4cbW0ZvTXm4jd5tOHugTe'

// GitHub: OAuth app
// const OAUTH_CLIENT_ID = 'c9521c42ff708172ca45'

export const OAUTH_DOMAIN = 'bldrs.us.auth0.com'


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
  const appPrefix = '/share'
  const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : ''
  const installedAppPrefix = installPrefix + appPrefix
  const location = useLocation()
  const navigate = useNavigate()

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
    <Auth0Provider
      domain={OAUTH_DOMAIN}
      clientId={OAUTH_CLIENT_ID}
      redirectUri={window.location.origin}>{/* Can add + '/Share' for local. */}
      <Routes>
        <Route path={basePath} element={<Outlet/>}>
          <Route
            path="share/*"
            element={
              testElt ||
                <ShareRoutes
                  installPrefix={installPrefix}
                  appPrefix={installedAppPrefix} />
            }/>
          <Route
            path="login/*"
            element={<h1>Login</h1>}/>
        </Route>
      </Routes>
    </Auth0Provider>
  )
}
