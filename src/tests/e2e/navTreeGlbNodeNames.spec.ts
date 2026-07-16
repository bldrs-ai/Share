import {expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Standard glTF scene/node naming in the NavTree (issue #1595), against a
 * small purpose-built fixture (`NamedScene.glb`, generated for this spec)
 * that simulates the NASA ISS model's shape: a generic authored scene name
 * (`Scene`), an underscore-prefixed wrapper (`_root`, with nested child
 * `Node 02`), lowercase noise (`panel_01`) and real capitalized names
 * (`OCO3`, `ECOStress`) — stored in deliberately unsorted document order
 * `[_root, panel_01, OCO3, ECOStress]`.
 *
 * What this pins:
 *   - glTF node names (GLTFLoader → `Object3D.name`) surface as NavTree
 *     labels instead of the pre-#1595 'Object' placeholder.
 *   - The root label composes the source filename in parens —
 *     "Scene (NamedScene.glb)" — matching the three.js editor's use of the
 *     import filename for generically-named scenes.
 *   - Scenegraph siblings display in lexicographic+caps order (UTF-16
 *     ordinal: capitals < '_' < lowercase), so real names rank above
 *     exporter scaffolding: ECOStress, OCO3, _root, panel_01.
 */
const {describe} = test

const GLB_PATH = '/share/v/gh/bldrs-ai/test-models/main/glb/NamedScene.glb'
const TEST_TIMEOUT_MS = 60_000

describe('NavTree GLB standard node naming', () => {
  test('shows named nodes, filename-composed root, and sorted order', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, GLB_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()

    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)

    // Root label: authored scene name + source filename in parens.
    await expect(node('Scene (NamedScene.glb)')).toBeVisible()

    // Expand the root; children carry their glTF node names (not the
    // 'Object' placeholder) in lexicographic+caps display order —
    // document order in the file is [_root, panel_01, OCO3, ECOStress].
    await node('Scene (NamedScene.glb)').getByTestId('NavTreeNodeToggle').click()
    const rowLabels = page.locator('[data-node-label]')
    await expect(rowLabels).toHaveCount(5)
    await expect(rowLabels.nth(0)).toHaveAttribute('data-node-label', 'Scene (NamedScene.glb)')
    await expect(rowLabels.nth(1)).toHaveAttribute('data-node-label', 'ECOStress')
    await expect(rowLabels.nth(2)).toHaveAttribute('data-node-label', 'OCO3')
    await expect(rowLabels.nth(3)).toHaveAttribute('data-node-label', '_root')
    await expect(rowLabels.nth(4)).toHaveAttribute('data-node-label', 'panel_01')

    // Nested names survive too: _root's child is a named node. The
    // authored name is "Node 02" — GLTFLoader sanitizes node names for
    // animation-binding paths (PropertyBinding.sanitizeNodeName:
    // whitespace → '_'), so it surfaces as "Node_02", same as in the
    // three.js editor.
    await node('_root').getByTestId('NavTreeNodeToggle').click()
    await expect(node('Node_02')).toBeVisible()
  })
})
