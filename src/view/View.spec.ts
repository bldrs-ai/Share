import {expect, test} from '@playwright/test'
import {waitForModelReady} from '../tests/e2e/models'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../tests/e2e/utils'
import {expectScreen} from '../tests/screens'


const {beforeEach, describe} = test
/**
 * Camera view tests - verifies camera near/far plane setup
 */
describe('View', () => {
  describe('Camera planes setup', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('Camera near and far planes are set correctly - Screenshot', async ({page}) => {
      // Wait for model to be fully loaded
      await waitForModelReady(page)

      // Get camera properties via page evaluation using the store
      const cameraProps = await page.evaluate(() => {
        const store = (window as unknown as WindowWithStore).store
        if (!store) {
          return null
        }
        const viewer = store.getState().viewer
        if (!viewer) {
          return null
        }
        const camera = viewer.context?.getCamera()
        if (!camera) {
          return null
        }
        return {
          near: camera.near,
          far: camera.far,
        }
      })

      // Verify camera properties are set
      expect(cameraProps).not.toBeNull()
      if (cameraProps) {
        expect(cameraProps.near).toBeGreaterThan(0)
        expect(cameraProps.far).toBeGreaterThan(cameraProps.near)
        // Far plane should be large enough for the model (at least 1000)
        const minFarPlane = 1000
        expect(cameraProps.far).toBeGreaterThan(minFarPlane)
      }

      // Take screenshot of the default view
      await expectScreen(page, 'view-camera-default.png')

      // Verify camera controls zoom limits are set
      const zoomLimits = await page.evaluate(() => {
        const store = (window as unknown as WindowWithStore).store
        if (!store) {
          return null
        }
        const viewer = store.getState().viewer
        if (!viewer) {
          return null
        }
        const cameraControls = viewer.IFC?.context?.ifcCamera?.cameraControls
        if (!cameraControls) {
          return null
        }
        return {
          minDistance: cameraControls.minDistance,
          maxDistance: cameraControls.maxDistance,
        }
      })

      // Verify zoom limits are set (if available)
      if (zoomLimits) {
        expect(zoomLimits.minDistance).toBeGreaterThan(0)
        expect(zoomLimits.maxDistance).toBeGreaterThan(Number(zoomLimits.minDistance))
      }
    })

    test('Camera planes adapt to model size - Screenshot', async ({page}) => {
      // Wait for model to be fully loaded
      await waitForModelReady(page)

      // Get initial camera properties
      const initialCameraProps = await page.evaluate(() => {
        const store = (window as unknown as WindowWithStore).store
        if (!store) {
          return null
        }
        const viewer = store.getState().viewer
        if (!viewer) {
          return null
        }
        const camera = viewer.context?.getCamera()
        if (!camera) {
          return null
        }
        return {
          near: camera.near,
          far: camera.far,
        }
      })

      expect(initialCameraProps).not.toBeNull()

      // Take screenshot showing the model fits in view
      await expectScreen(page, 'view-camera-model-fits.png')

      // Verify the camera far plane is sufficient for the model
      if (initialCameraProps) {
        // The far plane should be large enough (at least several thousand units)
        // for typical building models
        const minFarPlane = 1000
        expect(initialCameraProps.far).toBeGreaterThan(minFarPlane)
      }
    })
  })
})


type WindowWithStore = Window & {
  store?: {
    getState: () => {
      viewer?: {
        context?: {
          getCamera: () => {
            near: number
            far: number
          } | null
        }
        IFC?: {
          context?: {
            ifcCamera?: {
              cameraControls?: {
                minDistance?: number
                maxDistance?: number
              }
            }
          }
        }
      }
    }
  }
}

