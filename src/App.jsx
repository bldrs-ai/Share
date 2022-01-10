import React from 'react'
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom'
import CadView from './Containers/CadView'


const Forward = ({pathPrefix}) => {
  const location = useLocation(), navigate = useNavigate();
  console.log('Forward: location: ', location);
  React.useEffect(() => {
    console.log('App.jsx: Base: should forward?: ', location);
    if (location.pathname == pathPrefix) {
      console.log('App.jsx: Base: forwarding...');
      navigate(pathPrefix + '/v/p');
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
 */
const App = ({pathPrefix}) => (
  <Routes>
    <Route path="/" element={<Forward pathPrefix={pathPrefix}/>}>
      <Route path="v/p/*" element={<CadView pathPrefix={pathPrefix + '/v/p'} />}/>
      <Route path="v/gh/:org/:repo/:branch/*" element={<CadView pathPrefix={pathPrefix + '/v/gh'} />}/>
    </Route>
  </Routes>
)


export default App;
