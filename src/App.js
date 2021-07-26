import "./App.css";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import CadView from "./Containers/CadView";
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
            <CadView />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

export default App;
