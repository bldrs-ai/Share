import "./App.css";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import Home from "./Containers/Home";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import { grey } from "@material-ui/core/colors";

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
          <Route path="/">
            <Home />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

export default App;
