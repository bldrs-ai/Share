import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


const {beforeEach} = test

// Two uploads recorded in Local recents. Only LIVE has its bytes in OPFS;
// STALE is what a cleared cache (or a by-hand OPFS delete) leaves behind —
// the "Folder <id> not found" row this sweep exists to remove.
const LIVE_ID = '0B9F3C1E-2D4A-4E6B-8C7D-1A2B3C4D5E6F.ifc'
const STALE_ID = '7400223A-9EF4-404B-A590-9EF796F2DD95.ifc'


/**
 * Write LIVE's upload where `writeModelToOPFS` puts it (`<id>/<id>` at the
 * OPFS root) and record both entries the way `addRecentFileEntry` does.
 *
 * @param ids The two storage ids, passed in because this runs in the page
 */
async function seedRecents(ids: {live: string, stale: string}) {
  const {live, stale} = ids
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(live, {create: true})
  const file = await folder.getFileHandle(live, {create: true})
  const writable = await file.createWritable()
  await writable.write('ISO-10303-21;')
  await writable.close()
  const entry = (id: string, name: string) => ({id, source: 'local', name, lastModifiedUtc: null})
  localStorage.setItem('bldrs:recent-files', JSON.stringify({
    version: 1,
    files: [entry(stale, 'gone.ifc'), entry(live, 'here.ifc')],
  }))
}


/** @return Ids of the `local` recents currently in localStorage */
function storedLocalIds(): string[] {
  const store = JSON.parse(localStorage.getItem('bldrs:recent-files') ?? '{"files":[]}')
  return store.files
    .filter((f: {source: string}) => f.source === 'local')
    .map((f: {id: string}) => f.id)
}


/**
 * Local recents whose upload is gone from OPFS are dropped, at startup and
 * when the Open dialog is shown; ones still in OPFS are kept.
 */
describeMobileAndDesktop('Local recents are pruned to what is in OPFS', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await page.evaluate(seedRecents, {live: LIVE_ID, stale: STALE_ID})
  })

  test('Open dialog hides a recent whose upload is missing from OPFS', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByTestId('tab-local').click()

    await expect(page.getByTestId(`link-open-recent-${LIVE_ID}`)).toBeVisible()
    await expect(page.getByTestId(`link-open-recent-${STALE_ID}`)).toHaveCount(0)
    expect(await page.evaluate(storedLocalIds)).toEqual([LIVE_ID])
  })

  test('startup removes a recent whose upload is missing from OPFS', async ({page}) => {
    // Seeded after this page's startup sweep ran, so it takes a fresh
    // start to see it — and the dialog stays shut, so only startup acts.
    await page.reload()
    await expect.poll(() => page.evaluate(storedLocalIds)).toEqual([LIVE_ID])
  })
})
