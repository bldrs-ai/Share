import {createTheme} from '@mui/material/styles'
import {grey} from '@mui/material/colors'
import {useEffect, useMemo, useState} from 'react'
import * as Privacy from './privacy/Privacy'


/**
 * @return {object} {theme, colorMode}
 */
export default function useShareTheme() {
  const [themeChangeListeners] = useState({})
  const [mode, setMode] = useState(Privacy.getCookie({
    component: 'theme',
    name: 'mode',
    defaultValue: getSystemCurrentLightDark(),
  }))


  const theme = useMemo(() => {
    return loadTheme(mode)
  }, [mode])


  const colorMode = useMemo(() => {
    return {
      isDay: () => mode === Themes.Day,
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


export const Themes = {
  Day: 'Day',
  Night: 'Night',
}


/**
 * @param {string} mode
 * @return {object} Theme settings
 */
function loadTheme(mode) {
  // https://mui.com/customization/color/#color-palette
  const lightGreen = '#C8E8C7'
  const darkGreen = '#459A47'
  const fontFamily = 'Roboto'
  const lime = '#4EEF4B'
  const day = {
    primary: {
      main: grey[100],
      background: grey[200],
    },
    secondary: {
      main: grey[800],
      background: grey[300],
    },
    highlight: {
      main: lightGreen,
      secondary: darkGreen,
      heavy: grey[300],
      heavier: grey[400],
      heaviest: grey[500],
      maximum: 'black',
      lime,
    },
  }
  const night = {
    primary: {
      main: grey[800],
      background: grey[700],
    },
    secondary: {
      main: grey[100],
      background: grey[700],
    },
    highlight: {
      main: darkGreen,
      secondary: lightGreen,
      heavy: grey[600],
      heavier: grey[500],
      heaviest: grey[400],
      lime,
    },
  }
  const fontSize = 16
  const lineHeight = '1.5em'
  const letterSpacing = 'normal'
  const fontWeight = '400'
  const typography = {
    fontFamily: fontFamily,
    fontSize: fontSize,
    lineHeight: lineHeight,
    letterSpacing: letterSpacing,
    h1: {fontSize: '1.3em', fontWeight},
    h2: {fontSize: '1.2em', fontWeight},
    h3: {fontSize: '1.1em', fontWeight},
    h4: {fontSize: fontSize, fontWeight: '600', textDecoration: 'underline'},
    h5: {fontSize, textDecoration: 'underline'},
    body1: {fontSize, lineHeight, letterSpacing, fontWeight},
    body2: {fontSize: '0.9em'},
    tree: {fontSize, lineHeight, letterSpacing, fontWeight},
    propTitle: {fontSize, lineHeight, letterSpacing, fontWeight},
    propValue: {fontSize, lineHeight, letterSpacing, fontWeight: '100'},
  }
  // TODO(pablo): still not sure how this works.  The docs make it
  // look like we don't need an explicit color scheme for dark; that
  // it will be created automatically.  I think I've had that working
  // before, but this is all that works now.
  // https://mui.com/customization/dark-mode/
  let activePalette = mode === Themes.Day ? day : night
  activePalette = {...activePalette, ...{
    mode: mode === Themes.Day ? 'light' : 'dark',
    background: {
      paper: activePalette.primary.main,
    },
  }}
  const components = {
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: activePalette.secondary.main,
            backgroundColor: activePalette.secondary.background,
            borderRadius: '5px',
          },
          '& > div.MuiTreeItem-content': {
            borderRadius: '5px',
          },
        },
      },
    },
    MuiButton: {
      variants: [
        {
          props: {variant: 'rectangular'},
          style: {
            width: '180px',
            height: '40px',
            textTransform: 'none',
            color: activePalette.secondary.main,
          },
        },
      ],
      defaultProps: {
        disableElevation: true,
        disableFocusRipple: true,
        disableRipple: true,
      },
    },
  }
  const theme = {
    components: components,
    typography: typography,
    shape: {borderRadius: 8},
    palette: activePalette,
    button: {},
  }
  return createTheme(theme)
}


/**
 * Look for explicit night, otherwise day
 *
 * See https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme
 *
 * @return {string}
 * @private
 */
export function getSystemCurrentLightDark() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? Themes.Night : Themes.Day
  }
  return Themes.Day
}
