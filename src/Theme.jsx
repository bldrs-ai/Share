import {useEffect, useMemo, useState} from 'react'
import {grey, blueGrey} from '@mui/material/colors'
import {createTheme} from '@mui/material/styles'
import * as Privacy from './privacy/Privacy'


/**
 * @return {Object} {theme, colorMode}
 */
export default function useTheme() {
  const [themeChangeListeners] = useState({})
  const [mode, setMode] = useState(Privacy.getCookie({
    component: 'theme',
    name: 'mode',
    defaultValue: Themes.Day}))


  const theme = useMemo(() => {
    return loadTheme(mode)
  }, [mode])


  const colorMode = useMemo(() => {
    return {
      isDay: () => mode == Themes.Day,
      getTheme: () => theme,
      toggleColorMode: () => {
        setMode((prevMode) => {
          const newMode = prevMode === Themes.Day ? Themes.Night : Themes.Day
          Privacy.setCookie({component: 'theme', name: 'mode', value: newMode})
          return newMode
        })
      },
      addThemeChangeListener: (onChangeCb) => {
        themeChangeListeners[onChangeCb] = onChangeCb
      },
    }
  }, [mode, theme, themeChangeListeners])


  useEffect(() => {
    if (mode && theme) {
      Object.values(themeChangeListeners).map((onChangeCb) => onChangeCb(mode, theme))
    }
  }, [mode, theme, themeChangeListeners])

  return {theme, colorMode}
}


const Themes = {
  Day: 'Day',
  Night: 'Night',
}


/**
 * @param {string} mode
 * @return {Object} Theme settings
 */
function loadTheme(mode) {
  // https://mui.com/customization/color/#color-palette
//  const dayLight = 50
  const dayMain = 100
  //  const dayDark = 300
  //  const dayContrast = 800
  const day = {
    primary: {
      //      light: grey[dayLight],
      main: grey[dayMain],
      //      dark: grey[dayDark],
      //      contrastText: grey[dayContrast],
    },
    secondary: {
      //      light: blueGrey[dayLight],
      main: blueGrey[dayMain],
      //      dark: blueGrey[dayDark],
      //      contrastText: blueGrey[dayContrast],
    },
  }
  //  const nightLight = 300
  const nightMain = 800
  //  const nightDark = 900
  //  const nightContrast = 50
  const night = {
    primary: {
      //      light: grey[nightLight],
      main: grey[nightMain],
      //      dark: grey[nightDark],
      //      contrastText: grey[nightContrast],
    },
    secondary: {
      //      light: blueGrey[nightLight],
      main: blueGrey[nightMain],
      //      dark: blueGrey[nightDark],
      //      contrastText: blueGrey[nightContrast],
    },
  }
  // https://mui.com/customization/dark-mode/
  const typography = {
    h1: {fontSize: '1.4rem'},
    h2: {fontSize: '1.3rem'},
    h3: {fontSize: '1.2rem'},
    h4: {fontSize: '1.1rem'},
    h5: {fontSize: '1rem'},
  }
  let activePalette = mode == Themes.Day ? day : night
  activePalette = {...activePalette, ...{
    background: {
      paper: activePalette.primary.main,
    },
  }}
  const theme = {
    mode,
    typography: typography,
    shape: {borderRadius: 10},
    palette: activePalette,
  }
  return createTheme(theme)
}
