import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Per-BODY selection in a STEP model that has no assembly structure at all —
 * the shape `BLSN_007.stp` (test-models-private#98) turned out to be: ONE
 * product, zero `NEXT_ASSEMBLY_USAGE_OCCURRENCE`, and every body named
 * individually inside one child representation. Share showed it as a
 * single-node tree in which every click selected the whole boat.
 *
 * conway#628 gives such a body its own identity: its occurrence path ends
 * with its own express id, on the spatial-tree node and on the geometry
 * instance alike, so the path alone is the selection key. Share's side of
 * that is `resolvePickedOccurrenceNode` / `resolveElementPathOccurrence`
 * (`utils/occurrencePaths.js`) — see
 * design/new/step-occurrence-selection.md §"Identity below the product".
 *
 * The fixture is conway's `data/ap214-inverted-srr-multibody.step`, the same
 * shape reduced to three named bodies behind three inverted relationship
 * edges. Two consequences for what this spec can assert:
 *
 *   - Its `CLOSED_SHELL`s are empty, so the model tessellates to nothing.
 *     The tree, the row highlight and the permalink are all driven by
 *     `getSpatialStructure` and are fully exercised; the scene-side
 *     `setInstanceSelection` narrowing has no geometry to draw and is
 *     pinned by unit tests instead (`ShareViewer.test.js`
 *     "resolves one body of a no-NAUO multibody model", `IfcIsolator.test.js`
 *     "hides one body of a no-NAUO multibody product").
 *   - A scene double-click likewise has nothing to hit, so the pick →
 *     NavTree/Properties direction is unit-tested
 *     (`occurrencePaths.test.js` "selects the picked body of a no-NAUO
 *     multibody model") rather than driven through the canvas here.
 *
 * Node identity is read through the `data-node-label` / `data-is-selected`
 * hooks on `NavTreeNode`, as in the sibling `navTreeOccurrenceSelection` /
 * `navTreePermalink` specs.
 */
const MODEL_PATH =
  '/share/v/gh/bldrs-ai/test-models/main/step/ap214-inverted-srr-multibody.step'
const TEST_TIMEOUT_MS = 90_000


/**
 * The spatial tree's body rows, as the engine handed them over. Read through
 * the store (`window.store` under the playwright build, `window.useStore`
 * otherwise — see `store/useStore.js` and `BaseRoutes.jsx`) because the DOM
 * shows only the label: the occurrence path is the thing under test.
 *
 * @param page playwright page
 * @return one entry per child of the product root
 */
async function readBodyPaths(
  page: Page,
): Promise<Array<{expressID: number, occurrencePath: number[]}>> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const root = (w.store ?? w.useStore)?.getState?.().rootElement
    if (!root) {
      throw new Error('readBodyPaths: no rootElement on the store — did the model load?')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (root.children ?? []).map((child: any) => ({
      expressID: child.expressID,
      occurrencePath: child.occurrencePath,
    }))
  })
}


/**
 * The occurrence-keyed half of the current selection.
 *
 * @param page playwright page
 * @return selected element ids, occurrence path and solid express id
 */
async function readSelection(
  page: Page,
): Promise<{selectedElements: string[], occurrencePath: number[], solidExpressId: number|null}> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const state = (w.store ?? w.useStore)?.getState?.()
    return {
      selectedElements: state?.selectedElements ?? [],
      // Normalised to an array so a null path (the pre-conway#628 fall-through
      // to scalar-id selection) fails the length assertion rather than the
      // evaluate itself.
      occurrencePath: state?.selectedOccurrencePath ?? [],
      solidExpressId: state?.selectedSolidExpressId ?? null,
    }
  })
}

describeMobileAndDesktop('NavTree STEP per-body selection', () => {
  test('each named body is its own tree row and its own selection', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, MODEL_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    await page.getByTestId('control-button-navigation').click()
    const navTreePanel = page.getByTestId('NavTreePanel')
    await expect(navTreePanel).toBeVisible()

    const node = (label: string) => navTreePanel.locator(`[data-node-label="${label}"]`)

    // The product root, and — expanded — one row per named body. Pre-#628 the
    // solid layer was opt-in, so this tree was the root alone.
    await expect(node('Document')).toBeVisible()
    await node('Document').getByTestId('NavTreeNodeToggle').click()
    await expect(node('brep_0')).toBeVisible()
    await expect(node('brep_1')).toBeVisible()
    await expect(node('Hauptkoerper')).toBeVisible()

    // Every body node's occurrence path is its own express id — the conway#628
    // contract Share's whole per-body join rests on. Read from the live tree
    // rather than inferred from the UI, because it is what distinguishes this
    // engine from the one before it: pre-#628 all three bodies carried the
    // product's (empty) path and were indistinguishable.
    const bodyPaths = await readBodyPaths(page)
    expect(bodyPaths).toHaveLength(3)
    for (const {expressID, occurrencePath} of bodyPaths) {
      expect(occurrencePath).toEqual([expressID])
    }

    // Selecting one body highlights that row and no other. All three bodies
    // belong to the same product_definition_shape, so a selection keyed on the
    // scalar expressID — or on a shared occurrence path — lights up all of
    // them; only the per-body path tells them apart.
    await node('brep_1').getByTestId('NavTreeNodeLabel').click()
    await expect(node('brep_1')).toHaveAttribute('data-is-selected', 'true')
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)

    // …and the selection that reached the store IS the body: its own express
    // id as the selected element, the same id as the occurrence path's only
    // segment and as the selected solid. Pre-#628 this click fell through to
    // the scalar-id branch with a null occurrence path, which is exactly the
    // state a scene pick could not reconcile against.
    const selection = await readSelection(page)
    expect(selection.occurrencePath).toHaveLength(1)
    expect(selection.solidExpressId).toBe(selection.occurrencePath[0])
    expect(selection.selectedElements).toEqual([`${selection.solidExpressId}`])

    // The permalink addresses the body directly: [root, ...occurrencePath],
    // where the path's last segment IS the body. The bug this guards is a
    // repeated trailing segment (/root/body/body), which reads back as an
    // anonymous piece under the body and resolves to nothing.
    const selectedPath = new URL(page.url()).pathname
    const elementPath = selectedPath.split('.step')[1]
    expect(elementPath).toMatch(/^\/\d+\/\d+$/)
    const [rootId, bodyId] = elementPath.slice(1).split('/')
    expect(bodyId).not.toBe(rootId)

    // Reload that permalink: the body must come back selected — the resolver
    // reading the URL is the inverse of the writer that produced it.
    await page.goto(selectedPath)
    await waitForModelReady(page)
    await page.getByTestId('control-button-navigation').click()
    await expect(navTreePanel).toBeVisible()
    await expect(node('brep_1')).toHaveAttribute('data-is-selected', 'true')
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)

    // A different body selects independently: the first row's highlight moves,
    // it doesn't accumulate.
    await node('Hauptkoerper').getByTestId('NavTreeNodeLabel').click()
    await expect(node('Hauptkoerper')).toHaveAttribute('data-is-selected', 'true')
    await expect(node('brep_1')).toHaveAttribute('data-is-selected', 'false')
  })
})
