import {expect, test} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {rememberShownModel, waitForModelOtherThan} from '../../tests/e2e/modelSwitch'
import {
  auth0Login,
  homepageSetupWithAuth,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


const REPOSITORY = '/repos/cypresstester/test-repo/git'
const SAVED_MODEL = '/share/v/gh/cypresstester/test-repo/'


describeMobileAndDesktop('Versions 100: Save a model to GitHub', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetupWithAuth(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('opens the Save dialog for a signed-out user', async ({page}) => {
    await expect(page.getByTestId('gated-save')).toHaveCount(0)
    await page.getByTestId('control-button-save').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  for (const {title, filename} of [
    {title: 'saves to a new file', filename: 'save-model-test.ifc'},
    {title: 'replaces an existing file', filename: 'window.ifc'},
  ]) {
    test(title, async ({page}) => {
      await auth0Login(page)
      await page.getByTestId('control-button-save').click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox', {name: 'Organization'}).click()
      await page.getByRole('option', {name: '@cypresstester', exact: true}).click()
      await dialog.getByRole('combobox', {name: 'Repository'}).click()
      await page.getByRole('option', {name: 'test-repo', exact: true}).click()
      await dialog.getByRole('combobox', {name: 'Branch'}).click()
      await page.getByRole('option', {name: 'main', exact: true}).click()
      await dialog.getByRole('textbox', {name: 'Enter file name'}).fill(filename)

      await rememberShownModel(page, 'beforeSave')
      const [blob, tree, commit, ref, contents] = await Promise.all([
        page.waitForResponse((response) => response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith(`${REPOSITORY}/blobs`)),
        page.waitForResponse((response) => response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith(`${REPOSITORY}/trees`)),
        page.waitForResponse((response) => response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith(`${REPOSITORY}/commits`)),
        page.waitForResponse((response) => response.request().method() === 'PATCH' &&
          decodeURIComponent(new URL(response.url()).pathname).endsWith(`${REPOSITORY}/refs/heads/main`)),
        page.waitForResponse((response) => response.request().method() === 'GET' &&
          decodeURIComponent(new URL(response.url()).pathname).endsWith(
            `/repos/cypresstester/test-repo/contents/${filename}`,
          )),
        dialog.getByRole('button', {name: 'action-button'}).filter({hasText: 'Save model'}).click(),
      ])

      expect(blob.ok()).toBe(true)
      const {content, encoding} = blob.request().postDataJSON()
      expect(encoding).toBe('base64')
      expect(Buffer.from(content, 'base64')).toEqual(await readFile('public/index.ifc'))
      expect(tree.ok()).toBe(true)
      expect(tree.request().postDataJSON()).toMatchObject({
        base_tree: 'treeSha',
        tree: [{path: filename, sha: (await blob.json()).sha}],
      })
      expect(commit.ok()).toBe(true)
      expect(commit.request().postDataJSON()).toMatchObject({
        tree: (await tree.json()).sha,
        parents: ['parentSha'],
      })
      expect(ref.ok()).toBe(true)
      const {sha} = await commit.json()
      expect(sha).toMatch(/^[a-f0-9]{40}$/)
      expect(ref.request().postDataJSON()).toMatchObject({sha})

      await expect.poll(() => new URL(page.url()).pathname).toBe(`${SAVED_MODEL}${sha}/${filename}`)
      expect(contents.ok()).toBe(true)
      expect(new URL(contents.url()).searchParams.get('ref')).toBe(sha)
      await waitForModelOtherThan(page, 'beforeSave')

      await page.getByTestId('control-button-navigation').click()
      await expect(page.getByTestId('NavTreePanel').getByText('Bldrs', {exact: true})).toBeVisible()
      await page.getByTestId('control-button-navigation').click()
      await page.getByTestId('control-button-save').click()
      await expect(dialog.getByRole('button', {name: 'action-button'}).filter({hasText: 'Save model'})).toBeEnabled()
    })
  }
})
