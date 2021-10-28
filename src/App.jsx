import './App.css';
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { grey } from '@material-ui/core/colors';
import CadView from './Containers/CadView';

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
  return (
    <ThemeProvider theme={outerTheme}>
      <Router>
        <Switch>
          <Route path='/'>
            <CadView />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

export default App;
