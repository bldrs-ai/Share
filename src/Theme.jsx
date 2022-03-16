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
  const day = {
    primary: {
      main: grey[100],
    },
    secondary: {
      main: blueGrey[100],
    },
  }
  const night = {
    primary: {
      main: grey[800],
    },
    secondary: {
      main: blueGrey[600],
    },
  }
  const typography = {
    h1: {fontSize: '1.4rem'},
    h2: {fontSize: '1.3rem'},
    h3: {fontSize: '1.2rem'},
    h4: {fontSize: '1.1rem'},
    h5: {fontSize: '1rem'},
    body2: {fontSize: '.8rem'},
  }
  // TODO(pablo): still not sure how this works.  The docs make it
  // look like we don't need an explicit color scheme for dark; that
  // it will be created automatically.  I think I've had that working
  // before, but this is all that works now.
  // https://mui.com/customization/dark-mode/
  let activePalette = mode == Themes.Day ? day : night
  activePalette = {...activePalette, ...{
    mode: mode == Themes.Day ? 'light' : 'dark',
    background: {
      paper: activePalette.primary.main,
    },
  }}
  const theme = {
    typography: typography,
    shape: {borderRadius: 10},
    palette: activePalette,
  }
  return createTheme(theme)
}
