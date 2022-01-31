import React from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom'
import CadView from './Containers/CadView'
import 'normalize.css'


const debug = 0;


function Forward({appPrefix}) {
  const location = useLocation(), navigate = useNavigate();
  React.useEffect(() => {
    if (debug) {
      console.log('Share.jsx: should forward?: ', location);
    }
    if (location.pathname == appPrefix) {
      const dest = appPrefix + '/v/p';
      if (debug) {
        console.log('Share.jsx: Base: forwarding to: ', dest);
      }
      navigate(dest);
    }
  }, []);

  return (<Outlet/>)
}


/**
 * For URL design see: https://github.com/buildrs/Share/wiki/URL-Structure
 *
 * Examples for this component:
 *   http://host/share/v/p/haus.ifc
 *   http://host/share/v/gh/IFCjs/test-ifc-files/main/Others/479l7.ifc
 *                    ^... here on handled by this component's paths.
 *              ^... path to the component in BaseRoutes.jsx.
 */
export default function Share({installPrefix, appPrefix}) {
  return (
    <Routes>
      <Route path="/" element={<Forward appPrefix={appPrefix}/>}>
        <Route path="v/p/*"
               element={
                 <CadView
                   installPrefix={installPrefix}
                   appPrefix={appPrefix}
                   pathPrefix={appPrefix + '/v/p'} />
               } />
        <Route path="v/gh/:org/:repo/:branch/*"
               element={
                 <CadView
                   installPrefix={installPrefix}
                   appPrefix={appPrefix}
                   pathPrefix={appPrefix + '/v/p'} />
               } />
      </Route>
    </Routes>);
}
