import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Share dialog "Display settings" toggle (view-140 S7).
 *
 * The Display menu's choices ride in the `#d:` hash token, and — like the
 * camera — the sender decides whether they travel. This is the toggle that
 * decides it: default ON (a shared link reproduces what the sender was looking
 * at), and off strips the token from the link the dialog shows, the QR code
 * encodes, and "Copy Link" copies.
 *
 * Asserted on the URL rather than on scene state, because for this control the
 * URL *is* the product: the scene must NOT change when the toggle flips.
 * Both surfaces are checked — `window.location` (what `onCopy` writes to the
 * clipboard) and the TextField (what the user reads and the QR encodes) — since
 * `window.location` isn't reactive and the two can disagree; ShareDialog's
 * handlers mutate the location inline for exactly that reason, and a regression
 * there shows up as a stale TextField beside a correct `page.url()`.
 *
 * Fixture: the colorless NIST as1 variant (see tests/e2e/colorMode.spec.ts) —
 * the palette applies, so the Color section is offered and there is a
 * non-default display state to serialize. A model in its default display
 * contributes no token at all (design/new/model-display-controls.md §6.1),
 * which is why the flow sets Source first.
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const DISPLAY_TOKEN = 'd:color=src'
const TEST_TIMEOUT_MS = 90_000


describeMobileAndDesktop('Share dialog display settings', () => {
  test('carries the #d: token when on and strips it when off', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    // Give the model a non-default display state to share.
    await page.getByTestId('control-button-residency').click()
    await page.getByLabel('Source').check()
    // The popover is modal; dismiss it before reaching the bottom bar again.
    await page.keyboard.press('Escape')

    await page.getByTestId('control-button-share').click()
    // `textfield-link` lands on the MUI TextField ROOT, and the field is
    // `multiline` — so the value lives on the inner textarea, and MUI renders a
    // second `aria-hidden` one as its autosize shadow. Take the real one.
    const link = page.getByTestId('textfield-link')
      .locator('textarea:not([aria-hidden="true"])')
    await expect(link).toBeVisible()

    // Default ON, like the camera toggle above it in the dialog.
    await expect(page.getByTestId('toggle-display')).toHaveAttribute('class', /Mui-checked/)
    await expect(link).toHaveValue(new RegExp(DISPLAY_TOKEN))
    expect(page.url()).toContain(DISPLAY_TOKEN)

    // Off: the whole token goes, not just the term.
    await page.getByTestId('toggle-display').click()
    await expect(page.getByTestId('toggle-display')).not.toHaveAttribute('class', /Mui-checked/)
    await expect(link).not.toHaveValue(new RegExp(DISPLAY_TOKEN))
    expect(page.url()).not.toContain('d:')

    // Back on: the sender's display returns to the link.
    await page.getByTestId('toggle-display').click()
    await expect(page.getByTestId('toggle-display')).toHaveAttribute('class', /Mui-checked/)
    await expect(link).toHaveValue(new RegExp(DISPLAY_TOKEN))
    expect(page.url()).toContain(DISPLAY_TOKEN)
  })
})
