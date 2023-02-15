import {useEffect, useMemo, useState} from 'react'
import {createTheme} from '@mui/material/styles'
import * as Privacy from '../privacy/Privacy'
import {getComponentOverrides} from './Components'
import {getTypography} from './Typography'
import {day, night} from './Palette'


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
  const theme = {
    components: getComponentOverrides(activePalette),
    typography: getTypography(),
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
