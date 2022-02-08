import React from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useSearchParams
} from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import Share from './Share'
import debug from './utils/debug'

// TODO: This isn't used.
// If icons-material isn't imported somewhere, mui dies
import AccountCircle from '@mui/icons-material/AccountCircle'


/**
 * From URL design: https://github.com/buildrs/Share/wiki/URL-Structure
 * ... We adopt a URL structure similar to Google Apps URL structure:
 *
 *   http://host/<app>/<view>/<object>
 *
 * which when fully expanded becomes:
 *
 *   http://host/share/v/p/haus.ifc
 *   http://host/share/v/gh/buildrs/Share/main/public/haus.ifc
 *
 * @param testElt For unit test allow use of a stub here instead of loading the app.
 */
export default function BaseRoutes({testElt = null}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : '';

  React.useEffect(() => {
    const referrer = document.referrer;
    debug().log('BaseRoutes: document.referrer: ', referrer);
    if (referrer) {
      const ref = new URL(referrer);
      if (ref.pathname.length > 1) {
        navigate(ref);
      }
    }
    if (location.pathname === installPrefix
        || location.pathname === (installPrefix + '/')) {
      debug().log('BaseRoutes: forwarding to: ', installPrefix + '/share');
      navigate(installPrefix + '/share');
    }
  }, []);

  const basePath = installPrefix + "/*";
  return (
    <Routes>
      <Route path={basePath} element={<Themed/>}>
        <Route path="share/*"
               element={
                 testElt || <Share installPrefix={installPrefix}
                                   appPrefix={installPrefix + '/share'} />
               }/>
      </Route>
    </Routes>
  )
}


const theme = createTheme({
  status: {
    danger: 'foo',
  },
});


const Themed = () => (
  <ThemeProvider theme={theme}>
    <Outlet/>
  </ThemeProvider>
)
