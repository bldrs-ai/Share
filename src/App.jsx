import './App.css';
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { grey } from '@material-ui/core/colors';
import CadView from './Containers/CadView';
import XYZExtract from './Containers/Tools/XYZExtract/XYZExtract.js';
import ReactGA from 'react-ga';

const outerTheme = createTheme({
  palette: {
    primary: {
      main: grey[500],
      light: grey[100],
    },
    secondary: {
      main: grey[700],
    },
  },
});

function App() {
  const initReactGA = () => {
    ReactGA.initialize('UA-210924287-2');
    ReactGA.pageview('test-init-pageview');
  };
  useEffect(() => {
    initReactGA();
  }, []);
  return (
    <ThemeProvider theme={outerTheme}>
      <Router>
        <Switch>
          <Route exact path='/'>
            <CadView />
          </Route>
          <Route path='/extract'>
            <XYZExtract />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

export default App;
