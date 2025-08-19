// tests/helpers/cad-ready.ts
import { expect, Page } from '@playwright/test';


export async function homepageReady(page: Page) {
  // 1) Don’t wait for full load
  // SPAs often keep connections open (WS, analytics), so load can hang.
  // Wait for domcontentloaded instead.
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // This should really be returning quickly, but for stability do one big wait here.
  const dropzone = page.getByTestId('cadview-dropzone')
  await expect(dropzone).toHaveAttribute('data-model-ready', 'true', { timeout: 90_000 })
}
