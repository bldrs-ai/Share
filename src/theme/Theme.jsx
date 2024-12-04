import {useEffect, useMemo, useState} from 'react'
import {createTheme} from '@mui/material/styles'
import * as Preferences from '../privacy/preferences'
import useStore from '../store/useStore'
import {getComponentOverrides} from './Components'
import {getTypography} from './Typography'
import {day, night} from './Palette'


/**
 * @return {object} theme
 */
export default function useShareTheme() {
  const isThemeEnabled = useStore((state) => state.isThemeEnabled)
  const [mode, setMode] = useState(isThemeEnabled ? (Preferences.getTheme() || getSystemCurrentLightDark()) : Themes.Day)

  const [themeChangeListeners] = useState({})


  const theme = useMemo(() => {
    return loadTheme(mode, setMode, themeChangeListeners)
  }, [mode, setMode, themeChangeListeners])


  useEffect(() => {
    if (mode && theme) {
      Object.values(themeChangeListeners).map((onChangeCb) => onChangeCb(mode, theme))
    }
  }, [mode, theme, themeChangeListeners])

  return theme
}


export const Themes = {
  Day: 'Day',
  Night: 'Night',
}


/**
 * @param {string} mode
 * @param {Function} setMode
 * @param {Array.Function} themeChangeListeners
 * @return {object} Theme settings
 */
function loadTheme(mode, setMode, themeChangeListeners) {
  // TODO(pablo): still not sure how this works.  The docs make it
  // look like we don't need an explicit color scheme for dark; that
  // it will be created automatically.  I think I've had that working
  // before, but this is all that works now.
  // https://mui.com/customization/dark-mode/
  const activePalette = mode === Themes.Day ? day : night
  const theme = {
    components: getComponentOverrides(activePalette),
    typography: getTypography(),
    shape: {borderRadius: 10},
    palette: activePalette,
    zIndex: {
      modal: 2000,
    },
    toggleColorMode: () => {
      setMode((prevMode) => {
        const newMode = prevMode === Themes.Day ? Themes.Night : Themes.Day
        Preferences.setTheme(newMode)
        return newMode
      })
    },
    addThemeChangeListener: (onChangeCb) => {
      themeChangeListeners[onChangeCb] = onChangeCb
    },
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
