import {test} from '@playwright/test'
import {MOBILE_WIDTH} from '../../utils/constants'


/**
 * A form factor a spec runs under. `useIsMobile` is a pure window-width
 * check (width <= MOBILE_WIDTH, src/Components/Hooks.jsx), so switching
 * the viewport is all it takes to flip the app into its mobile layout —
 * no device emulation or user-agent games needed.
 */
export interface FormFactor {
  name: 'desktop' | 'mobile'
  isMobile: boolean
}


export const DESKTOP: FormFactor = {name: 'desktop', isMobile: false}
export const MOBILE: FormFactor = {name: 'mobile', isMobile: true}


// Desktop matches the config-level default viewport
// (tools/playwright.config.js), so desktop runs are byte-identical with
// or without this helper. Mobile is an ordinary phone size safely under
// MOBILE_WIDTH; the height matters for bottom-anchored affordances.
export const DESKTOP_VIEWPORT = {width: 1280, height: 800}
const MOBILE_VIEWPORT_WIDTH = 390
const MOBILE_VIEWPORT_HEIGHT = 844
export const MOBILE_VIEWPORT = {width: MOBILE_VIEWPORT_WIDTH, height: MOBILE_VIEWPORT_HEIGHT}

// The helper's premise: the mobile viewport must actually trip the
// app's width check, or every "[mobile]" suite silently runs desktop.
if (MOBILE_VIEWPORT.width > MOBILE_WIDTH) {
  throw new Error(`MOBILE_VIEWPORT.width must be <= MOBILE_WIDTH (${MOBILE_WIDTH})`)
}


/**
 * Run the same suite body once per form factor, `[desktop]` / `[mobile]`
 * suffixed so a failure names the layout it broke. The body receives the
 * form factor and should branch only where the UX genuinely diverges —
 * shared flows stay shared:
 *
 *   describeMobileAndDesktop('MyFeature', (ff) => {
 *     test('shared flow', ...)
 *     if (!ff.isMobile) {
 *       test('desktop-only affordance', ...)
 *     }
 *   })
 *
 * @param title Suite title, without the form-factor suffix
 * @param body Suite body, invoked once per form factor
 */
export function describeMobileAndDesktop(title: string, body: (ff: FormFactor) => void) {
  for (const ff of [DESKTOP, MOBILE]) {
    test.describe(`${title} [${ff.name}]`, () => {
      test.use({
        viewport: ff.isMobile ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT,
        hasTouch: ff.isMobile,
      })
      body(ff)
    })
  }
}
