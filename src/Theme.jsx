import {createTheme} from '@mui/material/styles'
import {grey} from '@mui/material/colors'
import {useEffect, useMemo, useState} from 'react'
import * as Privacy from './privacy/Privacy'


/**
 * @return {object} {theme, colorMode}
 */
export default function useTheme() {
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
  const fontFamily = 'Helvetica'
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
      heavy: grey[700],
      heavier: grey[600],
      heaviest: grey[500],
      lime,
    },
  }
  const fontSize = '1rem'
  const lineHeight = '1.5em'
  const letterSpacing = 'normal'
  const fontWeight = '400'
  const fontWeightBold = '400'
  const typography = {
    fontWeightRegular: fontWeight,
    fontWeightBold,
    fontWeightMedium: fontWeight,
    h1: {fontSize: '1.3rem', lineHeight, letterSpacing, fontWeight, fontFamily},
    h2: {fontSize: '1.2rem', lineHeight, letterSpacing, fontWeight, fontFamily},
    h3: {fontSize: '1.1rem', lineHeight, letterSpacing, fontWeight, fontFamily},
    h4: {fontSize: '0.9rem', lineHeight, letterSpacing, fontWeight, fontFamily},
    h5: {fontSize, lineHeight, letterSpacing, fontWeight, fontFamily},
    p: {fontSize, lineHeight, letterSpacing, fontWeight, fontFamily},
    tree: {fontSize, lineHeight, letterSpacing, fontWeight, fontFamily},
    propTitle: {fontSize, lineHeight, letterSpacing, fontWeight, fontFamily},
    propValue: {
      fontSize,
      lineHeight,
      letterSpacing,
      fontWeight: '100',
      fontFamily},
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
            border: `1px solid ${activePalette.highlight.main}`,
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
