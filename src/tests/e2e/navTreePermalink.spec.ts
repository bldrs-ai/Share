import {expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * NavTree assembly-row highlight + element-path permalink round-trip, against
 * the NIST `as1-oc-214.stp` assembly (a STEP model that reuses parts across
 * occurrences). Companion to navTreeOccurrenceSelection.spec.ts; see
 * design/new/step-occurrence-selection.md.
 *
 * What this pins (the two fixes that motivated it):
 *   - Selecting an ASSEMBLY node marks its own row selected — the row
 *     highlight was leaf-only (`!hasChildren` guard in NavTreePanel's
 *     RenderRow), so an assembly click selected in scene/properties but the
 *     tree showed nothing.
 *   - The element-path permalink a selection writes actually restores that
 *     selection on a fresh page load. Two pre-fix failure modes: (a) the
 *     pathname→element-path split matched filetype names appearing as plain
 *     directory segments (the "step" in .../main/step/nist/...), so the
 *     watcher never even parsed the path; (b) the trailing id alone
 *     under-determines a reused part's occurrence (duplicated subtrees share
 *     expressIDs) — the path below the root resolves as the occurrence path.
 *
 * Node identity is asserted via the `data-node-label` / `data-is-selected` /
 * `data-is-expanded` hooks on `NavTreeNode` (labels repeat across a reused
 * part's occurrences; selection is themed via backgroundColor).
 */
const {describe} = test

const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214.stp'
// Two full STEP parse + tessellation passes (initial load + permalink reload).
const TEST_TIMEOUT_MS = 180_000
const RELOAD_ASSERT_TIMEOUT_MS = 15_000

describe('NavTree assembly selection and element-path permalink', () => {
  test('assembly click marks its row; permalink restores the per-occurrence selection', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    // Open the NavTree panel (writes `#n:` to the hash, so the permalink
    // captured below reopens it on the fresh load).
    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()

    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    const firstNode = (label: string) => node(label).first()
    const selectedNodes = page.locator('[data-is-selected="true"]')

    // Expand the assembly root; both reused l-bracket-assembly occurrences show.
    await expect(firstNode('as1')).toBeVisible()
    await firstNode('as1').getByTestId('NavTreeNodeToggle').click()
    await expect(node('l-bracket-assembly')).toHaveCount(2)

    // Fix 1: clicking an ASSEMBLY node highlights its own row — exactly one
    // row, so the reused second occurrence must not light up with it.
    await firstNode('l-bracket-assembly').getByTestId('NavTreeNodeLabel').click()
    await expect(firstNode('l-bracket-assembly')).toHaveAttribute('data-is-selected', 'true')
    await expect(selectedNodes).toHaveCount(1)
    // The click wrote an element-path permalink: root id + occurrence path.
    await expect(page).toHaveURL(/as1-oc-214\.stp\/\d+\/\d+(#|$)/)
    // Selecting a node auto-expands the path to it (itself included), so the
    // assembly's children are now revealed — no toggle click (that would
    // collapse it again).
    await expect(firstNode('l-bracket-assembly')).toHaveAttribute('data-is-expanded', 'true')

    // Select the l-bracket LEAF under the FIRST assembly — a reused part
    // whose duplicate (same expressID) sits under the second assembly.
    await expect(firstNode('l-bracket')).toBeVisible()
    await firstNode('l-bracket').getByTestId('NavTreeNodeLabel').click()
    await expect(firstNode('l-bracket')).toHaveAttribute('data-is-selected', 'true')
    await expect(selectedNodes).toHaveCount(1)
    await expect(page).toHaveURL(/as1-oc-214\.stp\/\d+\/\d+\/\d+(#|$)/)
    const permalink = page.url()

    // Fix 2: a fresh full-page load of that permalink restores the selection.
    await page.goto(permalink, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()

    // The tree auto-expands the path to the encoded occurrence and highlights
    // exactly that node.
    await expect(selectedNodes).toHaveCount(1, {timeout: RELOAD_ASSERT_TIMEOUT_MS})
    await expect(selectedNodes.first()).toHaveAttribute('data-node-label', 'l-bracket')
    // The FIRST assembly (the selected occurrence's parent) is open; the
    // second stays closed — the path encodes which duplicate was meant.
    await expect(node('l-bracket-assembly').first()).toHaveAttribute('data-is-expanded', 'true')
    await expect(node('l-bracket-assembly').nth(1)).toHaveAttribute('data-is-expanded', 'false')

    // Open the second assembly: its duplicate l-bracket (same expressID) must
    // NOT read as selected — the permalink is per-occurrence, not per-id.
    await node('l-bracket-assembly').nth(1).getByTestId('NavTreeNodeToggle').click()
    await expect(node('l-bracket')).toHaveCount(2)
    await expect(node('l-bracket').first()).toHaveAttribute('data-is-selected', 'true')
    await expect(node('l-bracket').nth(1)).toHaveAttribute('data-is-selected', 'false')
    await expect(selectedNodes).toHaveCount(1)
  })
})
