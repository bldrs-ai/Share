import React from 'react'
import {act, render} from '@testing-library/react'
import {BrowserRouter, useNavigate} from 'react-router-dom'
import useStore from '../store/useStore'
import SelectionHashWriter, {modelFileInPath} from './SelectionHashWriter'


/* eslint-disable no-magic-numbers */


let navigateRef = null
/**
 * Hands the test react-router's navigate, the way an open surface has it.
 *
 * @return {null}
 */
function NavigateGrabber() {
  navigateRef = useNavigate()
  return null
}


describe('Containers/SelectionHashWriter', () => {
  const viewer = {isolator: {ifcModel: {}, _isSceneGraphModel: () => false}}

  beforeEach(() => {
    window.history.replaceState(null, '', '/share/v/p/index.ifc/81/621')
    act(() => useStore.setState({
      viewer,
      isModelReady: true,
      selectedAnchorIds: [621],
      selectedOccurrencePath: null,
    }))
  })

  const renderWriter = () => render(
    <BrowserRouter>
      <NavigateGrabber/>
      <SelectionHashWriter/>
    </BrowserRouter>)

  it('writes a single selection the path no longer names, within its model', () => {
    renderWriter()
    expect(window.location.hash).toBe('')
    act(() => navigateRef('/share/v/p/index.ifc/81/999'))
    expect(window.location.hash).toBe('#sel:e621')
  })

  // open-205 #2021: an in-app open (or a Back) changes the path before the
  // left model's viewer and selection are replaced.
  it('writes nothing into another model\'s URL while the left model\'s viewer is still up', () => {
    renderWriter()
    act(() => navigateRef('/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'))
    expect(window.location.hash).toBe('')
    // The next model's viewer, ready, writes its own selection again.
    act(() => useStore.setState({viewer: {isolator: {ifcModel: {}, _isSceneGraphModel: () => false}}}))
    expect(window.location.hash).toBe('#sel:e621')
  })

  it('names the model by its file, or a Drive route by its file id, whatever element path follows', () => {
    expect(modelFileInPath('/share/v/p/index.ifc/81/621')).toBe('/share/v/p/index.ifc')
    expect(modelFileInPath('/share/v/gh/o/r/main/as1.stp/1/2')).toBe('/share/v/gh/o/r/main/as1.stp')
    expect(modelFileInPath('/share/v/g/1AbC_d-9/12/34')).toBe('/share/v/g/1AbC_d-9')
    expect(modelFileInPath('/share/v/g/https:/drive.google.com/file/d/1AbC_d-9/view'))
      .toBe('/share/v/g/https:/drive.google.com/file/d/1AbC_d-9')
    expect(modelFileInPath('/share/v/g/1AbC')).not.toBe(modelFileInPath('/share/v/g/2XyZ'))
  })
})
