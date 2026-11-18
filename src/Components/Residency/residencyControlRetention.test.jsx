/* eslint-disable no-magic-numbers */
import React from 'react'
import {Sphere, Vector3} from 'three'
import {act, fireEvent, render} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {isCollected} from '../../utils/gc.fixture'
import ResidencyControl from './ResidencyControl'


// As in ResidencyControl.test.jsx: ShareMock's BaseRoutesMock automocks
// three, and ResidencyController needs the real one.
jest.mock('three', () => jest.requireActual('three'))

// Every section on: shading behind `displayControls`, motion residency
// (its only flag is the off switch, left off).
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => name === 'displayControls',
}))


/**
 * A batched-model double that every section of the menu applies to: colors
 * from the palette, a material to wireframe, and three instances to evict.
 * Built in its own function, so nothing in this file's scope holds it.
 *
 * @return {object}
 */
function makeModel() {
  const grey = () => ({x: 0.8, y: 0.8, z: 0.8, w: 1})
  const radii = [1, 2, 3]
  const model = {
    isBatchedMesh: true,
    instanceSourceColors: radii.map(grey),
    instanceColors: radii.map(grey),
    instanceParents: [11, 12, 20],
    instanceGeometryIds: [0, 1, 2],
    material: {wireframe: false},
    userData: {},
    setColorAt: () => undefined,
    geometry: {attributes: {position: {}}, index: {}},
    getGeometryIdAt: (index) => index,
    getGeometryRangeAt: (geometryId, target = {}) => Object.assign(target, {
      vertexStart: 0, vertexCount: radii[geometryId] * 100, indexStart: 0, indexCount: radii[geometryId] * 100,
    }),
    getBoundingSphereAt: (geometryId, target) => target.copy(new Sphere(new Vector3(), radii[geometryId])),
    getMatrixAt: (index, matrix) => matrix.identity(),
    setVisibleAt: () => undefined,
  }
  return model
}


/**
 * A viewer double with the seams MotionResidency attaches to. Its camera
 * controls really remove a listener, as camera-controls does, so a disposed
 * driver is not kept by the double.
 *
 * @return {object}
 */
function makeViewer() {
  const listeners = new Set()
  const controls = {
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
  }
  return {
    context: {
      getCameraControls: () => controls,
      onFrame: () => () => undefined,
      getRenderDemand: () => ({observePaints: () => () => undefined}),
      getRenderer: () => null,
      getCamera: () => null,
    },
  }
}


/**
 * Put a new model in the store, keeping only a WeakRef to it here.
 *
 * @return {Promise<WeakRef>}
 */
async function showNewModel() {
  const model = makeModel()
  await act(() => useStore.getState().setModel(model))
  return new WeakRef(model)
}


describe('ResidencyControl retention (open-205, #2019)', () => {
  afterEach(async () => {
    await act(() => {
      useStore.getState().setModel(null)
      useStore.getState().setViewer(null)
      useStore.getState().resetDisplayOverrides()
    })
    window.location.hash = ''
  })

  // MUI's Popover keeps closures from its first render for its whole life
  // (useModal's handleClose / isTopModal, over its first props), and those
  // reach this control's render scope and its `model`. So the menu remounts
  // per model; without that, the first model shown stayed reachable after
  // an in-app switch.
  it('lets the model it showed go after a switch to another', async () => {
    await act(() => useStore.getState().setViewer(makeViewer()))
    const firstRef = await showNewModel()
    const {getByTestId} = render(<ResidencyControl/>, {wrapper: ShareMock})
    // Open and close the menu, as a user does.
    fireEvent.click(getByTestId('control-button-residency'))
    fireEvent.keyDown(document.activeElement, {key: 'Escape'})

    // A new viewer comes before the next model, as on an in-app load.
    await act(() => useStore.getState().setViewer(makeViewer()))
    await showNewModel()

    expect(getByTestId('control-button-residency')).toBeTruthy()
    expect(await isCollected(firstRef)).toBe(true)
  })
})
