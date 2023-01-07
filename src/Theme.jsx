import {createTheme} from '@mui/material/styles'
import {grey, green} from '@mui/material/colors'
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
  const fontFamily = 'Helvetica'
  const colors = {
    grey: {
      lightest: grey[100],
      light: grey[300],
      medium: grey[400],
      dark: grey[700],
      darkest: grey[900],
    },
    green: {
      lightest: green[100],
      light: green[300],
      medium: green[500],
      dark: green[800],
      darkest: green[900],
    },
    lime: green[400],
    black: 'black',
  }
  const day = {
    primary: {
      main: colors.grey.medium,
      background: colors.grey.light,
      contrastText: colors.black,
    },
    secondary: {
      main: colors.green.dark,
      background: colors.green.darkest,
      contrastText: colors.green.darkest,
    },
    scene: {
      background: colors.grey.lightest,
    },
  }
  const night = {
    primary: {
      main: colors.grey.dark,
      background: colors.grey.darkest,
      contrastText: colors.grey.lightest,
    },
    secondary: {
      main: colors.green.lightest,
      background: colors.green.medium,
      contrastText: colors.green.lightest,
    },
    scene: {
      background: colors.black,
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
    h3: {fontSize: '1.1em', fontWeight: 400},
    h4: {fontSize: fontSize, fontWeight},
    h5: {fontSize, textDecoration: 'underline'},
    body1: {fontSize, lineHeight, letterSpacing, fontWeight},
    body2: {fontSize, lineHeight, letterSpacing, fontWeight},
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
      paper: activePalette.primary.background,
    },
  }}
  const components = {
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: activePalette.primary.contrastText,
            backgroundColor: activePalette.primary.main,
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
            border: `solid 1px ${activePalette.primary.main}`,
            backgroundColor: activePalette.primary.main,
          },
        },
      ],
      defaultProps: {
        disableElevation: true,
        disableFocusRipple: true,
        disableRipple: true,
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        sizeMedium: {
          'margin': '.2em 0em .2em 0em',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: activePalette.primary.background,
            opacity: .8,
          },
        },
      },
    },
    MuiPaper: {
      variants: [
        {
          props: {variant: 'control'},
          style: {
            backgroundColor: activePalette.primary.background,
          },
        },
        {
          props: {variant: 'note'},
          style: {
            backgroundColor: activePalette.scene.background,
          },
        },
      ],
    },
  }
  const theme = {
    components: components,
    typography: typography,
    shape: {borderRadius: 8},
    palette: activePalette,
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
