import React, { useState, useMemo, createContext } from 'react';
import {
  Outlet,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CadView from './Containers/CadView';
import 'normalize.css';


const debug = 0;
const ColorModeContext = createContext({ toggleColorMode: () => {} });

function Forward({ appPrefix }) {
  const location = useLocation(),
  navigate = useNavigate();
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
  return <Outlet />;
}

/**
 * For URL design see: https://github.com/buildrs/Share/wiki/URL-Structure
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
 *   .../v/p/tinyhouse.ifc
 *
 * will load a second new instance fot that path.
 *
 * Examples for this component:
 *   http://host/share/v/p/haus.ifc
 *   http://host/share/v/gh/IFCjs/test-ifc-files/main/Others/479l7.ifc
 *                    ^... here on handled by this component's paths.
 *              ^... path to the component in BaseRoutes.jsx.
 */
export default function Share({ installPrefix, appPrefix }) {
  const [mode, setMode] = React.useState('light');
  const colorMode = React.useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
      },
    }),
    []
  );

  const theme = React.useMemo(() => {
    return createTheme({
      palette: {
        mode,
        primary: {
          main: '#C8C8C8',
          light: '#e3f2fd',
          dark: '#42a5f5',
        },
        background: {
          paper: mode === 'light' ? '#DCDCDC' : '#252525',
        },
        tonalOffset: 1,
      },
    });
  }, [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <Routes>
          <Route path='/' element={<Forward appPrefix={appPrefix} />}>
            <Route
              path='v/new/*'
              element={
                <CadView
                  installPrefix={installPrefix}
                  appPrefix={appPrefix}
                  pathPrefix={appPrefix + '/v/new'}
                  toggleTheme={colorMode.toggleColorMode}
                  mode={mode}
                />
              }
            />
            <Route
              path='v/p/*'
              element={
                <CadView
                  installPrefix={installPrefix}
                  appPrefix={appPrefix}
                  pathPrefix={appPrefix + '/v/p'}
                  toggleTheme={colorMode.toggleColorMode}
                  mode={mode}
                />
              }
            />
            <Route
              path='v/gh/:org/:repo/:branch/*'
              element={
                <CadView
                  installPrefix={installPrefix}
                  appPrefix={appPrefix}
                  pathPrefix={appPrefix + '/v/gh'}
                  toggleTheme={colorMode.toggleColorMode}
                  mode={mode}
                />
              }
            />
          </Route>
        </Routes>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
