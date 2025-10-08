import {test, expect} from '@playwright/test'


/**
 * Basic cutplane functionality tests
 * Migrated from cypress/e2e/view-100/cutplanes.cy.js
 * @see https://github.com/bldrs-ai/Share/issues/1106
 */
test.describe('Cutplanes', () => {
  test.beforeEach(async ({context}) => {
    // Set returning user cookie to skip about dialog
    await context.addCookies([
      {
        name: 'isFirstTime',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ])
  })

  test('Cut plane control opens menu', async ({page}) => {
    await page.goto('/')
    
    // Wait for model to be ready
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})
    
    // Click cut plane control button
    await page.getByTestId('control-button-cut-plane').click({force: true})
    
    // Check that section menu is visible
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    
    // Verify menu items are present
    await expect(page.getByTestId('menu-item-plan')).toBeVisible()
    await expect(page.getByTestId('menu-item-section')).toBeVisible()
    await expect(page.getByTestId('menu-item-elevation')).toBeVisible()
  })

  test('Can select plan cut-plane', async ({page}) => {
    await page.goto('/')
    
    // Wait for model to be ready
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})
    
    // Open cut plane menu and select plan
    await page.getByTestId('control-button-cut-plane').click({force: true})
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    
    await page.getByTestId('menu-item-plan').click({force: true})
    
    // Menu should close after selection
    await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()
  })

  test('View cut-plane permalink loads correctly', async ({page}) => {
    // Visit a URL with cut-plane permalink
    await page.goto('/share/v/p/index.ifc#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
    
    // Wait for model to be ready
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})
    
    // Verify the model container is visible with cut-plane applied
    await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
  })
})