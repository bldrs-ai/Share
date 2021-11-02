import './App.css';
import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { grey } from '@material-ui/core/colors';
import CadView from './Containers/CadView';
import HelloApp from './Apps/HelloApp';

const bldrsTheme = createTheme({
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
    <ThemeProvider theme={bldrsTheme}>
      <Router>
        <Switch>
          <Route exact path='/'>
            <CadView />
          </Route>
          <Route path='/apps/hello'>
            <HelloApp />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

export default App;
