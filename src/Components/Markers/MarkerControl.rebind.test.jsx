import React, {useState} from 'react'
import v8 from 'v8'
import vm from 'vm'
import {act, render, waitFor} from '@testing-library/react'
import {Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene, Sprite} from 'three'
import useStore from '../../store/useStore'
import MarkerControl, {markerGroupsOf} from './MarkerControl'
import {MOCK_MARKERS} from './Marker.fixture'


/* eslint-disable no-magic-numbers */


// Share#2017: the viewer is re-created in-app (a theme change re-runs
// CadView's initViewer; every model load does too), and MarkerControl used
// to keep its first PlaceMark for good. That PlaceMark had bound the first
// viewer's canvas, camera and scene, so later markers went into a disposed
// scene, the live one showed none, and the store kept the old viewer alive.
// These render MarkerControl against two stand-in viewer contexts (a real
// three Scene and camera each, and ThreeContext#onFrame's subscribe shape)
// and swap the context prop, which is what OperationsGroup does when the
// store's viewer changes.
//
// The forced GC is V8's own, set up as in src/engine/engineSourceRetention.test.js:
// `--expose-gc` at runtime, `gc` fetched from a fresh context, the flag put
// back so later files in this worker don't get a global `gc`.
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')
v8.setFlagsFromString('--no-expose-gc')


/**
 * A viewer context stand-in. `frames` is what's subscribed to its frame
 * hook; a plain Set, not a jest.fn, whose recorded calls would keep every
 * subscriber (and so every PlaceMark) reachable.
 *
 * @return {object}
 */
function makeViewer() {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  camera.position.set(0, 0, 50)
  const canvas = document.createElement('canvas')
  const frames = new Set()
  const context = {
    getDomElement: () => canvas,
    getCamera: () => camera,
    getScene: () => scene,
    onFrame: (fn) => {
      frames.add(fn)
      return () => frames.delete(fn)
    },
  }
  return {scene, frames, context}
}


/**
 * @param {Scene} scene
 * @return {Sprite[]} the markers drawn into it
 */
function markersIn(scene) {
  return scene.children.filter((child) => child instanceof Sprite)
}


/** @return {Promise<void>} a turn of the event loop */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}


/**
 * @param {WeakRef} ref
 * @return {Promise<boolean>} whether the target was collected
 */
async function collected(ref) {
  for (let i = 0; i < 10; i++) {
    await tick()
    gc()
    if (ref.deref() === undefined) {
      return true
    }
  }
  return false
}


const model = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())


/**
 * @param {object} context
 * @return {React.ReactElement}
 */
function markerControlOn(context) {
  return <MarkerControl context={context} oppositeObjects={[model]} postProcessor={{}}/>
}


/** The notes code's handoff: flip the sync flag, then write the markers. */
function writeNoteMarkers() {
  act(() => {
    useStore.getState().toggleSynchSidebar()
    useStore.getState().writeMarkers(MOCK_MARKERS)
  })
}


describe('MarkerControl: a new viewer gets a new PlaceMark (#2017)', () => {
  const originalImage = global.Image
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeAll(() => {
    // PlaceMark draws its marker icon from an SVG blob onto a 2d canvas,
    // neither of which jsdom does. This Image "loads" a turn after its src is
    // set, so a placement is async the way it is in a browser.
    global.Image = class {
      /** @param {string} url */
      set src(url) {
        this._src = url
        setTimeout(() => this.onload?.(), 0)
      }

      /** @return {string} */
      get src() {
        return this._src
      }
    }
    HTMLCanvasElement.prototype.getContext = () => ({clearRect: () => undefined, drawImage: () => undefined})
    URL.createObjectURL = () => 'blob:placemark-icon'
    URL.revokeObjectURL = () => undefined
  })

  afterAll(() => {
    global.Image = originalImage
    HTMLCanvasElement.prototype.getContext = originalGetContext
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  beforeEach(() => {
    act(() => {
      useStore.getState().setPlaceMark(null)
      useStore.getState().writeMarkers([])
      useStore.getState().setSelectedPlaceMarkId(null)
      useStore.getState().setIsNotesVisible(true)
      useStore.getState().setIsPlaceMarkActivated(false)
    })
  })


  it('disposes the old PlaceMark and re-places the markers in the new scene', async () => {
    const first = makeViewer()
    const second = makeViewer()
    const {rerender, unmount} = render(markerControlOn(first.context))
    const firstPlaceMark = useStore.getState().placeMark
    expect(firstPlaceMark).not.toBeNull()
    expect(first.frames.size).toBe(1)

    writeNoteMarkers()
    await waitFor(() => expect(markersIn(first.scene)).toHaveLength(MOCK_MARKERS.length))
    const disposed = []
    for (const sprite of markersIn(first.scene)) {
      sprite.material.addEventListener('dispose', () => disposed.push('material'))
      sprite.material.map.addEventListener('dispose', () => disposed.push('texture'))
    }

    rerender(markerControlOn(second.context))
    const secondPlaceMark = useStore.getState().placeMark
    expect(secondPlaceMark).not.toBeNull()
    expect(secondPlaceMark).not.toBe(firstPlaceMark)
    // The old one: frame upkeep off, its markers out of its scene and freed.
    expect(firstPlaceMark.isDisposed()).toBe(true)
    expect(first.frames.size).toBe(0)
    expect(markersIn(first.scene)).toHaveLength(0)
    expect(firstPlaceMark.getPlacemarks()).toHaveLength(0)
    expect(disposed.filter((what) => what === 'material')).toHaveLength(MOCK_MARKERS.length)
    expect(disposed.filter((what) => what === 'texture')).toHaveLength(MOCK_MARKERS.length)

    // The new one: in the new viewer's loop, with the same markers, at the
    // same places, in the new scene.
    expect(second.frames.size).toBe(1)
    await waitFor(() => expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length))
    expect(markersIn(second.scene).map((sprite) => sprite.position.toArray()).sort())
      .toEqual(MOCK_MARKERS.map((marker) => marker.coordinates.slice(0, 3)).sort())
    expect([...markerGroupsOf(secondPlaceMark).keys()].sort()).toEqual(MOCK_MARKERS.map((marker) => marker.id).sort())

    // Unmounting (each model load does, OperationsGroup) releases it too.
    unmount()
    expect(useStore.getState().placeMark).toBeNull()
    expect(secondPlaceMark.isDisposed()).toBe(true)
    expect(second.frames.size).toBe(0)
    expect(markersIn(second.scene)).toHaveLength(0)
  })


  it('keeps the selected marker active across the rebind', async () => {
    const first = makeViewer()
    const second = makeViewer()
    const {rerender, unmount} = render(markerControlOn(first.context))
    writeNoteMarkers()
    await waitFor(() => expect(markersIn(first.scene)).toHaveLength(MOCK_MARKERS.length))
    // A click selection (PlacemarkHandlers#selectPlaceMark) lives only in
    // the sprites and the store's selectedPlaceMarkId, not in the markers.
    const selected = MOCK_MARKERS[1]
    act(() => useStore.getState().setSelectedPlaceMarkId(selected.id))

    rerender(markerControlOn(second.context))
    await waitFor(() => expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length))
    const groups = markerGroupsOf(useStore.getState().placeMark)
    for (const marker of MOCK_MARKERS) {
      const sprite = groups.get(marker.id)
      const isSelected = marker.id === selected.id
      expect(sprite.userData.isActive).toBe(isSelected)
      expect(sprite.material.color.getHex()).toBe(isSelected ? marker.activeColor : marker.inactiveColor)
    }
    unmount()
  })


  it('keeps the user placing a marker across the rebind', () => {
    const first = makeViewer()
    const second = makeViewer()
    const {rerender, unmount} = render(markerControlOn(first.context))
    act(() => {
      useStore.getState().placeMark.activate()
      useStore.getState().setIsPlaceMarkActivated(true)
    })
    rerender(markerControlOn(second.context))
    expect(useStore.getState().placeMark.activated).toBe(true)
    expect(second.context.getDomElement().style.cursor).toBe('alias')
    unmount()
  })


  it('drops a placement still in flight when its viewer goes', async () => {
    const first = makeViewer()
    const second = makeViewer()
    const {rerender, unmount} = render(markerControlOn(first.context))
    // Rebind before any marker icon has loaded.
    writeNoteMarkers()
    rerender(markerControlOn(second.context))
    await waitFor(() => expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length))
    // Give the first pass's icons every chance to land.
    await tick()
    await tick()
    expect(markersIn(first.scene)).toHaveLength(0)
    expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length)
    unmount()
  })


  it('places each marker once when a second pass overlaps the first', async () => {
    const viewer = makeViewer()
    const {unmount} = render(markerControlOn(viewer.context))
    // Two handoffs before either pass's icons load: the rebind's pass and
    // the notes refetch a newly loaded model starts.
    writeNoteMarkers()
    writeNoteMarkers()
    await waitFor(() => expect(markersIn(viewer.scene)).toHaveLength(MOCK_MARKERS.length))
    await tick()
    await tick()
    expect(markersIn(viewer.scene)).toHaveLength(MOCK_MARKERS.length)
    expect(useStore.getState().placeMark.getPlacemarks()).toHaveLength(MOCK_MARKERS.length)
    unmount()
  })


  it('lets the old PlaceMark and its scene be collected', async () => {
    const second = makeViewer()
    const {refs, unmount} = await rebindKeepingOnlyWeakRefs(second)
    expect(await collected(refs.placeMark), 'the old PlaceMark is still reachable').toBe(true)
    expect(await collected(refs.sprite), 'an old marker sprite is still reachable').toBe(true)
    expect(await collected(refs.scene), 'the old scene is still reachable').toBe(true)
    // The live one is untouched.
    expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length)
    unmount()
  })
})


/**
 * Mount on a first viewer, place the markers, rebind to `second`, and hand
 * back only WeakRefs to what the first viewer owned. In a helper of its own
 * because a suspended async function keeps its interpreter registers, stale
 * temporaries included, so a strong ref the test body once held (even as the
 * receiver of a method call) could keep the target alive across its awaits.
 * And the context is swapped through state rather than `rerender`, because
 * Testing Library keeps the element first passed to `render`, whose props
 * would keep the first context, and so its scene, reachable.
 *
 * @param {object} second The viewer to rebind to
 * @return {Promise<{refs: object, unmount: Function}>}
 */
async function rebindKeepingOnlyWeakRefs(second) {
  const first = makeViewer()
  const holder = {context: first.context, setContext: null, renderAgain: null}
  const {unmount} = render(<SwappableMarkerControl holder={holder}/>)
  holder.context = null
  writeNoteMarkers()
  await waitFor(() => expect(markersIn(first.scene)).toHaveLength(MOCK_MARKERS.length))
  const refs = {
    placeMark: new WeakRef(useStore.getState().placeMark),
    scene: new WeakRef(first.scene),
    sprite: new WeakRef(markersIn(first.scene)[0]),
  }
  act(() => holder.setContext(second.context))
  await waitFor(() => expect(markersIn(second.scene)).toHaveLength(MOCK_MARKERS.length))
  // React keeps the previous props on the fiber's alternate until the next
  // render of this component; one more render drops them.
  const livePlaceMark = new WeakRef(useStore.getState().placeMark)
  act(() => holder.renderAgain())
  expect(useStore.getState().placeMark, 'a render alone rebinds nothing').toBe(livePlaceMark.deref())
  return {refs, unmount}
}


/**
 * MarkerControl on the context in its state, which `holder.setContext`
 * swaps; `holder.renderAgain` re-renders it on the same one.
 *
 * @param {object} props
 * @param {object} props.holder `{context, setContext, renderAgain}`
 * @return {React.ReactElement}
 */
function SwappableMarkerControl({holder}) {
  const [context, setContext] = useState(holder.context)
  const [, setRenders] = useState(0)
  holder.setContext = setContext
  holder.renderAgain = () => setRenders((count) => count + 1)
  return markerControlOn(context)
}
