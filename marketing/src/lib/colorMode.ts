/**
 * Color mode shared with the viewer SPA via a cookie.
 *
 * The SPA writes `preferences.theme` with one of {Day, Night, System} (see
 * src/privacy/preferences.js and src/theme/Theme.jsx). Marketing reads the
 * same cookie so a user's theme follows them between the static site and the
 * app. Keep the cookie name and value strings in sync with the SPA — they
 * are the cross-app contract.
 */

export const THEME_COOKIE = 'preferences.theme'
export const THEME_COOKIE_MAX_AGE_DAYS = 365


export const Themes = {
  Day: 'Day',
  Night: 'Night',
  System: 'System',
} as const

export type ThemeMode = (typeof Themes)[keyof typeof Themes]
export type EffectiveMode = typeof Themes.Day | typeof Themes.Night


const ALL_MODES: readonly ThemeMode[] = [Themes.Day, Themes.Night, Themes.System]

/** Narrows an unknown string to a valid mode, or null if it isn't one. */
export function parseMode(value: string | null | undefined): ThemeMode | null {
  if (!value) {
    return null
  }
  return (ALL_MODES as readonly string[]).includes(value) ? (value as ThemeMode) : null
}


export function readModeCookie(): ThemeMode | null {
  if (typeof document === 'undefined') {
    return null
  }
  const match = document.cookie.match(/(?:^|;\s*)preferences\.theme=([^;]+)/)
  return match ? parseMode(decodeURIComponent(match[1])) : null
}


export function writeModeCookie(mode: ThemeMode) {
  if (typeof document === 'undefined') {
    return
  }
  const expires = new Date(Date.now() + THEME_COOKIE_MAX_AGE_DAYS * 86_400_000).toUTCString()
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(mode)}; expires=${expires}; path=/; samesite=lax`
}


export function getSystemPreference(): EffectiveMode {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return Themes.Day
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? Themes.Night : Themes.Day
}


export function resolveEffective(mode: ThemeMode): EffectiveMode {
  return mode === Themes.System ? getSystemPreference() : (mode as EffectiveMode)
}


/**
 * Inline script that runs in <head> before React hydrates. Reads the cookie,
 * resolves System → matchMedia, sets data-color-mode on <html>, and inserts
 * a stylesheet that overrides emotion's pre-baked day palette when the user
 * wants night. Without that override the static HTML — which always renders
 * the day theme so SSG output stays deterministic — flashes day→night for
 * users with a Night cookie or dark OS preference. The selectors target
 * body and AppBar's <header> only; React re-applies the full theme after
 * hydration. Kept compact so it stays inline in <head>.
 */
export const INIT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|;\\s*)preferences\\.theme=([^;]+)/);
var v=m?decodeURIComponent(m[1]):'System';
if(v==='System'){v=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'Night':'Day';}
document.documentElement.setAttribute('data-color-mode',v==='Night'?'night':'day');
var s=document.createElement('style');
s.textContent='[data-color-mode="night"] body{background-color:#0A0A0A;color:#fff;}[data-color-mode="night"] header{background-color:#000;color:#fff;}';
document.head.appendChild(s);
}catch(e){}})();`
