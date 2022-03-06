import {grey, blueGrey} from '@mui/material/colors'


export const Themes = {
  Day: 'Day',
  Night: 'Night',
}

/**
 * @param {function} createTheme Mui createTheme
 * @param {string} mode
 * @return {Object} Theme settings
 */
export function loadTheme(createTheme, mode) {
  // https://mui.com/customization/color/#color-palette
  const dayLight = 50
  const dayMain = 100
  const dayDark = 300
  const dayContrast = 800
  const day = {
    primary: {
      light: grey[dayLight],
      main: grey[dayMain],
      dark: grey[dayDark],
      contrastText: grey[dayContrast],
    },
    secondary: {
      light: blueGrey[dayLight],
      main: blueGrey[dayMain],
      dark: blueGrey[dayDark],
      contrastText: blueGrey[dayContrast],
    },
  }
  const nightLight = 300
  const nightMain = 500
  const nightDark = 900
  const nightContrast = 50
  const night = {
    primary: {
      light: grey[nightLight],
      main: grey[nightMain],
      dark: grey[nightDark],
      contrastText: grey[nightContrast],
    },
    secondary: {
      light: blueGrey[nightLight],
      main: blueGrey[nightMain],
      dark: blueGrey[nightDark],
      contrastText: blueGrey[nightContrast],
    },
  }
  // https://mui.com/customization/dark-mode/
  // const night = {mode: 'dark'}
  const typography = {
    h1: {fontSize: '1.4rem'},
    h2: {fontSize: '1.3rem'},
    h3: {fontSize: '1.2rem'},
    h4: {fontSize: '1.1rem'},
    h5: {fontSize: '1rem'},
  }
  const theme = {
    mode,
    palette: mode == Themes.Day ? day : night,
    typography: typography,
    shape: {borderRadius: 10},
  }
  const t = createTheme(theme)
  console.log('theme', t)
  return t
}
