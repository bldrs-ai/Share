import React from "react";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import Checkbox from "@material-ui/core/Checkbox";
import { green, orange } from "@material-ui/core/colors";

const outerTheme = createTheme({
  palette: {
    primary: {
      light: palette.primary[300],
      main: "red",
      dark: palette.primary[700],
      contrastText: getContrastText(palette.primary[500]),
    },
    secondary: {
      light: palette.secondary.A200,
      main: "red",
      dark: palette.secondary.A700,
      contrastText: getContrastText(palette.secondary.A400),
    },
    error: {
      light: palette.error[300],
      main: palette.error[500],
      dark: palette.error[700],
      contrastText: getContrastText(palette.error[500]),
    },
  },
});

export default function ThemeNesting() {
  return (
    <ThemeProvider theme={outerTheme}>
      <Checkbox defaultChecked />
      <ThemeProvider theme={innerTheme}>
        <Checkbox defaultChecked />
      </ThemeProvider>
    </ThemeProvider>
  );
}
