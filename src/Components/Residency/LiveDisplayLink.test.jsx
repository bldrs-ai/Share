/* eslint-disable no-magic-numbers */
import React from 'react'
import {act, render} from '@testing-library/react'
import useStore from '../../store/useStore'
import {HASH_DEBOUNCE_WAIT_MS} from '../../utils/debounce'
import {ResidencyMetric} from '../../model/ResidencyController'
import {noteUserDisplayChange} from '../Share/viewLink'
import LiveDisplayLink, {livePaths} from './LiveDisplayLink'


/** Let the debounced write land. */
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, HASH_DEBOUNCE_WAIT_MS + 20)))
}


/**
 * A residency override, as the Display menu or an Assist tool sets one.
 *
 * @param {number} percent
 */
async function setResidency(percent) {
  await act(() => {
    useStore.getState().setDisplayOverride({kind: 'model'},
      {residency: {percent, metric: ResidencyMetric.OCCUPANCY}})
  })
}


describe('Residency/LiveDisplayLink', () => {
  beforeEach(async () => {
    window.history.replaceState(null, '', '/share/v/p/index.ifc#d:res=60')
    await act(() => {
      // No color or shading choice on this double, so the token carries
      // residency alone; no viewer, so no hide / isolate terms.
      useStore.getState().setModel({userData: {}})
      useStore.getState().setIsDisplayInUrl(true)
      useStore.getState().setIsModelReady(true)
    })
    livePaths.clear()
  })
  afterEach(async () => {
    await act(() => {
      useStore.getState().setIsModelReady(false)
      useStore.getState().setModel(null)
      useStore.getState().resetDisplayOverrides()
      useStore.getState().setIsDisplayInUrl(true)
    })
  })

  it('leaves an incoming link\'s token alone until the user changes the display', async () => {
    render(<LiveDisplayLink/>)
    // A change the page makes (an Assist tool, a link seeding the menu).
    await setResidency(40)
    await settle()
    expect(window.location.hash).toBe('#d:res=60')
  })

  it('follows the display in place once the user has changed it', async () => {
    render(<LiveDisplayLink/>)
    const historyLength = window.history.length
    await setResidency(40)
    noteUserDisplayChange()
    await settle()
    expect(window.location.hash).toBe('#d:res=40')
    // Later changes, whoever makes them, are followed.
    await setResidency(25)
    await settle()
    expect(window.location.hash).toBe('#d:res=25')
    // No history entry for any of it.
    expect(window.history.length).toBe(historyLength)
  })

  it('writes nothing while the Share dialog\'s display switch is off', async () => {
    render(<LiveDisplayLink/>)
    await act(() => useStore.getState().setIsDisplayInUrl(false))
    await setResidency(40)
    noteUserDisplayChange()
    await settle()
    expect(window.location.hash).toBe('#d:res=60')
    // Back on, the next change is written.
    await act(() => useStore.getState().setIsDisplayInUrl(true))
    await setResidency(30)
    await settle()
    expect(window.location.hash).toBe('#d:res=30')
  })

  it('removes the token in place when the display returns to its defaults', async () => {
    render(<LiveDisplayLink/>)
    await setResidency(40)
    noteUserDisplayChange()
    await settle()
    await setResidency(100)
    await settle()
    expect(window.location.hash).toBe('')
  })

  it('writes nothing before the model is ready, then the user\'s change once it is', async () => {
    // A big model's tree is still being walked, and the link's hide terms not
    // yet applied, when the user can already change the display.
    await act(() => useStore.getState().setIsModelReady(false))
    render(<LiveDisplayLink/>)
    await setResidency(40)
    noteUserDisplayChange()
    await settle()
    expect(window.location.hash).toBe('#d:res=60')
    await act(() => useStore.getState().setIsModelReady(true))
    await settle()
    expect(window.location.hash).toBe('#d:res=40')
  })

  it('drops a pending write when the model changes, rather than write it into the next model\'s link', async () => {
    render(<LiveDisplayLink/>)
    await setResidency(40)
    noteUserDisplayChange()
    // Navigation to the next model comes first: its route, its link.
    window.history.replaceState(null, '', '/share/v/p/other.ifc#d:res=60')
    await act(() => useStore.getState().setModel({userData: {}}))
    await settle()
    expect(window.location.hash).toBe('#d:res=60')
  })

  it('stays live through a re-init of the same model', async () => {
    render(<LiveDisplayLink/>)
    await setResidency(40)
    noteUserDisplayChange()
    await settle()
    expect(window.location.hash).toBe('#d:res=40')
    // A theme toggle builds a new viewer: a new term, for the same route.
    await act(() => useStore.getState().setViewer({}))
    await setResidency(30)
    await settle()
    expect(window.location.hash).toBe('#d:res=30')
  })
})
