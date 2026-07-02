import {expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * NavTree ⇄ scene per-occurrence selection, exercised end-to-end against the
 * NIST `as1-oc-214.stp` assembly — a STEP model that reuses one part
 * (l-bracket-assembly, nut-bolt-assembly, nut, bolt) across several
 * occurrences. See design/new/step-occurrence-selection.md.
 *
 * What this pins (the follow-up fix that motivated it):
 *   - Selecting a node keeps the user's OTHER expanded branches open — a
 *     selection opens the path to the picked node, it must not collapse the
 *     rest of the tree (the pre-fix `setExpandedElements` replaced the set).
 *   - A reused part's occurrences are independently selectable: clicking one
 *     occurrence highlights exactly that node, not every reuse sharing the
 *     part-type expressID.
 *
 * Not covered here (needs canvas pixel-picking of a specific sub-part, which is
 * too brittle for a flow test): scene-pick → NavTree auto-expand. That path is
 * unit-tested via `expandedIdsForSelection` in `utils/TreeUtils.test.js`.
 *
 * Node identity is asserted via the `data-node-label` / `data-is-selected` /
 * `data-is-expanded` hooks on `NavTreeNode` — the label repeats across a
 * reused part's occurrences and selection is themed through `backgroundColor`,
 * so text/colour assertions would be ambiguous.
 */
const {describe} = test

const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214.stp'
// STEP parse + BREP tessellation of as1 is heavier than the IFC smoke models.
const TEST_TIMEOUT_MS = 90_000

describe('NavTree STEP occurrence selection', () => {
  test('selecting a node preserves other open branches; occurrences select independently', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    // Open the NavTree panel (closed by default without the `#n:` hash).
    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()

    // A locator for a node row by its label. `.first()` because a reused part
    // shows the same label on each occurrence.
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    const firstNode = (label: string) => node(label).first()

    // Expand the assembly root; both reused l-bracket-assembly occurrences and
    // the top-level plate render under it.
    await expect(firstNode('as1')).toBeVisible()
    await firstNode('as1').getByTestId('NavTreeNodeToggle').click()
    await expect(node('l-bracket-assembly')).toHaveCount(2)

    // Expand the first l-bracket-assembly → its nut-bolt-assembly children show.
    await firstNode('l-bracket-assembly').getByTestId('NavTreeNodeToggle').click()
    await expect(firstNode('nut-bolt-assembly')).toBeVisible()

    // Expand the first nut-bolt-assembly → its nut + bolt leaves show.
    await firstNode('nut-bolt-assembly').getByTestId('NavTreeNodeToggle').click()
    await expect(firstNode('nut')).toBeVisible()
    await expect(firstNode('bolt')).toBeVisible()
    await expect(firstNode('nut-bolt-assembly')).toHaveAttribute('data-is-expanded', 'true')

    // Select a DIFFERENT branch's leaf (the top-level plate).
    await firstNode('plate').getByTestId('NavTreeNodeLabel').click()
    await expect(firstNode('plate')).toHaveAttribute('data-is-selected', 'true')

    // The fix: selecting `plate` must NOT collapse the nut-bolt-assembly branch
    // the user opened. Pre-fix this replaced the expanded set and the nut/bolt
    // rows vanished.
    await expect(firstNode('nut-bolt-assembly')).toHaveAttribute('data-is-expanded', 'true')
    await expect(firstNode('nut')).toBeVisible()
    await expect(firstNode('bolt')).toBeVisible()

    // Per-occurrence: clicking one nut highlights exactly that node — not every
    // reuse of the shared part type.
    await firstNode('nut').getByTestId('NavTreeNodeLabel').click()
    await expect(firstNode('nut')).toHaveAttribute('data-is-selected', 'true')
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)

    // Per-occurrence hide: the eye on the FIRST l-bracket-assembly hides just
    // that occurrence — its eye flips to the hidden state while the second
    // l-bracket-assembly's eye stays the 'shown' eye (pre-fix, hiding by the
    // shared product id would have flipped both / done nothing).
    const assemblies = node('l-bracket-assembly')
    await assemblies.first().getByTestId('hide-icon').click()
    await expect(assemblies.first().getByTestId('unhide-icon')).toBeVisible()
    await expect(assemblies.last().getByTestId('hide-icon')).toBeVisible()
    // Toggling it back restores the 'shown' eye.
    await assemblies.first().getByTestId('unhide-icon').click()
    await expect(assemblies.first().getByTestId('hide-icon')).toBeVisible()
  })
})
