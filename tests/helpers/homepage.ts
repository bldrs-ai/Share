// tests/helpers/homepage.ts
import {expect, Page} from '@playwright/test'
import {waitForModel} from './utils'


/**
 * Navigate to homepage and wait for model to be ready
 *
 * @deprecated Use visitHomepageWaitForModel from utils.ts instead
 */
export async function homepageReady(page: Page) {
  // 1) Don't wait for full load
  // SPAs often keep connections open (WS, analytics), so load can hang.
  // Wait for domcontentloaded instead.
  await page.goto('/', {waitUntil: 'domcontentloaded', timeout: 10_000})

  // This should really be returning quickly, but for stability do one big wait here.
  const dropzone = page.getByTestId('cadview-dropzone')
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: 10_000})
}


/**
 * Enhanced homepage ready function using new utilities
 */
export async function homepageReadyEnhanced(page: Page) {
  await page.goto('/', {waitUntil: 'domcontentloaded', timeout: 10_000})
  await waitForModel(page)
}
