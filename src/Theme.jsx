import {useEffect, useMemo, useState} from 'react'
import {grey} from '@mui/material/colors'
import {createTheme} from '@mui/material/styles'
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
  const day = {
    primary: {
      main: grey[100],
    },
    secondary: {
      main: grey[200],
      background: grey[600],
    },
    custom: {
      highLight: '#C8E8C7',
      disable: 'lightGrey',
      neutral: 'white',
      preselect: '#CCCCCC',
      select: '#99E397',
    },
  }
  const night = {
    primary: {
      main: grey[800],
    },
    secondary: {
      main: grey[600],
      background: grey[300],
    },
    custom: {
      highLight: '#70AB32',
      disable: 'lightGrey',
      neutral: 'white',
      preselect: '#CCCCCC',
      select: '#99E397',
    },
  }
  const typography = {
    h1: {fontSize: '1.4rem'},
    h2: {fontSize: '1.3rem'},
    h3: {fontSize: '1.3rem', letterSpacing: '.07rem', lineHeight: '1.5em', fontWeight: 'lighter', fontFamily: 'Helvetica'},
    h4: {fontSize: '1.28rem', letterSpacing: '.07rem', llineHeight: '1.5em', fontFamily: 'Helvetica'},
    h5: {fontSize: '1.2rem', letterSpacing: '.07rem', llineHeight: '1.5em', fontFamily: 'Helvetica'},
    h6: {fontSize: '.9rem', letterSpacing: '.07rem', llineHeight: '1.5em', fontFamily: 'Helvetica'},
    h7: {fontSize: '1.1rem', letterSpacing: '.07rem', llineHeight: '1.5em', fontFamily: 'Helvetica'},
    dialogHeader: {fontSize: '1.2rem', letterSpacing: '.1rem', fontFamily: 'Helvetica'},
    dialogBody: {fontSize: '.9rem', letterSpacing: '.1rem', fontFamily: 'Helvetica'},
    body2: {fontSize: '.8rem'},
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
    overrides: {
      MuiStartIcon: {
        root: {
          marginRight: '40px',
        },
      },
    },
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: activePalette.secondary.main,
            backgroundColor: activePalette.secondary.background,
          },
        },
      },
    },
    MuiButton: {
      variants: [
        {
          props: {variant: 'rectangular'},
          style: {
            border: '1px solid grey',
            width: '288px',
            height: '50px',
            color: '#000000',
            background: 'none',
            textTransform: 'none',
            font: 'Inter',
            fontWeight: 600,
            fontSize: '16px',
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
    shape: {borderRadius: 5},
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
