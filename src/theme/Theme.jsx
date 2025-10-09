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
  const [mode, setMode] = useState(isThemeEnabled ? (Preferences.getTheme() || Themes.System) : Themes.System)
  const [systemTheme, setSystemTheme] = useState(getSystemCurrentLightDark())

  const [themeChangeListeners] = useState({})

  // Listen for system theme changes
  useEffect(() => {
    if (!window.matchMedia) {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? Themes.Night : Themes.Day)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Determine effective theme mode
  const effectiveMode = mode === Themes.System ? systemTheme : mode

  const theme = useMemo(() => {
    return loadTheme(effectiveMode, setMode, themeChangeListeners, mode)
  }, [effectiveMode, setMode, themeChangeListeners, mode])


  useEffect(() => {
    if (effectiveMode && theme) {
      Object.values(themeChangeListeners).map((onChangeCb) => onChangeCb(effectiveMode, theme))
    }
  }, [effectiveMode, theme, themeChangeListeners])

  return theme
}


export const Themes = {
  Day: 'Day',
  Night: 'Night',
  System: 'System',
}


/**
 * @param {string} mode - effective mode (Day/Night)
 * @param {Function} setMode
 * @param {Array.Function} themeChangeListeners
 * @param {string} originalMode - original mode preference (Day/Night/System)
 * @return {object} Theme settings
 */
function loadTheme(mode, setMode, themeChangeListeners, originalMode) {
  // TODO(pablo): still not sure how this works.  The docs make it
  // look like we don't need an explicit color scheme for dark; that
  // it will be created automatically.  I think I've had that working
  // before, but this is all that works now.
  // https://mui.com/customization/dark-mode/

  // Ensure we have a valid mode, default to Day if undefined
  const validMode = mode || Themes.Day
  const activePalette = validMode === Themes.Day ? day : night
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
        let newMode
        if (prevMode === Themes.Day) {
          newMode = Themes.Night
        } else if (prevMode === Themes.Night) {
          newMode = Themes.System
        } else {
          newMode = Themes.Day
        }
        Preferences.setTheme(newMode)
        return newMode
      })
    },
    setTheme: (newMode) => {
      setMode(newMode)
      Preferences.setTheme(newMode)
    },
    isSystemMode: originalMode === Themes.System,
    currentMode: originalMode || Themes.System,
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
