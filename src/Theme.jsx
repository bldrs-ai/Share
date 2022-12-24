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
  const fontFamily = 'Roboto'
  // https://mui.com/customization/color/#color-palette
  // https://m2.material.io/resources/color/#!/?view.left=0&view.right=0&primary.color=76FF03&secondary.color=FFEA00
  // primary: green, secondary: yellow
  const colors = {
    green: {
      web: 'green',
      s400: {
        light: '#84c887',
        medium: '#66bb6a',
        dark: '#47824a',
        contrastText: 'black',
      },
      s900: {
        light: '#5b874b',
        medium: '#33691e',
        dark: '#234915',
        contrastText: 'black',
      },
    },
    yellow: {
      web: 'yellow',
      s400: {
        light: '#ffff56',
        medium: '#ffea00',
        dark: '#c7b800',
        contrastText: 'white',
      },
      s900: {
        light: '#f79845',
        medium: '#f57f17',
        dark: '#ab5810', // NB: contrastText for dark should be 'white'
        contrastText: 'black',
      },
    },
    white: 'white',
    grey: {
      lightest: grey[100],
      light: grey[300],
      medium: grey[500],
      dark: grey[700],
      darkest: grey[900],
      web: 'green',
      contrastText: 'white',
    },
    black: 'black',
  }

  // Shade: 400
  const day = {
    primary: {
      light: colors.green.s400.light,
      main: colors.green.s400.medium,
      dark: colors.green.s400.dark,
      linkText: colors.green.web,
      contrastText: colors.green.s400.contrastText,
    },
    secondary: {
      light: colors.yellow.s400.light,
      main: colors.yellow.s400.medium,
      dark: colors.yellow.s400.dark,
      linkText: colors.green.web,
      contrastText: colors.yellow.s400.contrastText,
    },
    background: {
      light: colors.white,
      main: colors.grey.lightest,
      dark: colors.grey.light,
      linkText: colors.green.web,
      contrastText: colors.black,
    },
  }

  // Shade: 900
  const night = {
    primary: {
      light: colors.green.s900.light,
      main: colors.green.s900.medium,
      dark: colors.green.s900.dark,
      linkText: colors.green.web,
      contrastText: colors.green.s900.contrastText,
    },
    secondary: {
      light: colors.yellow.s900.light,
      main: colors.yellow.s900.medium,
      dark: colors.yellow.s900.dark,
      linkText: colors.yellow.web,
      contrastText: colors.yellow.s900.contrastText,
    },
    background: {
      light: colors.grey.medium,
      main: colors.grey.dark,
      dark: colors.grey.darkest,
      linkText: colors.grey.web,
      contrastText: colors.grey.contrastText,
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
  }}
  const components = {
    MuiPaper: {
      styleOverrides: {
        root: {
          background: activePalette.background.dark,
        },
      },
    },
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: activePalette.secondary.light,
            backgroundColor: activePalette.secondary.dark,
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
            color: activePalette.primary.contrastText,
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
    isDay: () => mode === Themes.Day,
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
