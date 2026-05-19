'use client'
import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'
import {
  EffectiveMode,
  ThemeMode,
  Themes,
  getSystemPreference,
  readModeCookie,
  resolveEffective,
  writeModeCookie,
} from '@/lib/colorMode'


interface ColorModeContextValue {
  mode: ThemeMode
  effectiveMode: EffectiveMode
  setMode: (next: ThemeMode) => void
  cycleMode: () => void
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null)


/**
 * Provides theme mode state synced with the SPA's preferences.theme cookie.
 *
 * SSR/SSG defaults to System (which renders as Day) so the static HTML is
 * deterministic. On mount we hydrate from the cookie and listen for OS
 * preference changes. The mode state drives ThemeRegistry's choice between
 * the day and night MUI themes; data-color-mode on <html> is set by the
 * inline script in layout.tsx so the initial paint matches without a flash.
 */
export default function ColorModeProvider({children}: {children: ReactNode}) {
  const [mode, setModeState] = useState<ThemeMode>(Themes.System)
  const [systemPref, setSystemPref] = useState<EffectiveMode>(Themes.Day)

  useEffect(() => {
    const stored = readModeCookie()
    if (stored) {
      setModeState(stored)
    }
    setSystemPref(getSystemPreference())

    if (!window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemPref(mq.matches ? Themes.Night : Themes.Day)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const effectiveMode: EffectiveMode = mode === Themes.System ? systemPref : (mode as EffectiveMode)

  useEffect(() => {
    document.documentElement.setAttribute('data-color-mode', effectiveMode === Themes.Night ? 'night' : 'day')
  }, [effectiveMode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    writeModeCookie(next)
  }, [])

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode =
        prev === Themes.Day ? Themes.Night : prev === Themes.Night ? Themes.System : Themes.Day
      writeModeCookie(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({mode, effectiveMode, setMode, cycleMode}),
    [mode, effectiveMode, setMode, cycleMode],
  )

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}


export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext)
  if (!ctx) {
    throw new Error('useColorMode must be used inside ColorModeProvider')
  }
  return ctx
}


/**
 * Hook variant for components that only need the effective mode (day|night).
 * Returns 'day' before the provider has mounted, matching the static-export
 * default. Safe to use during initial render without conditionals.
 */
export function useEffectiveMode(): EffectiveMode {
  const ctx = useContext(ColorModeContext)
  return ctx?.effectiveMode ?? Themes.Day
}


/**
 * For consumers that want to resolve a mode value without going through the
 * provider (e.g. one-off computations). Prefer the hooks above in React tree.
 */
export {resolveEffective}
