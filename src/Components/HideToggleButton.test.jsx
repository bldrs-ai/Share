import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import useStore from '../store/useStore'
import HideToggleButton from './HideToggleButton'


jest.mock('../viewer/three/IfcIsolator', () => ({}))


describe('HideToggleButton', () => {
  /**
   * @param {object} isolator what the eye may call on the isolator
   * @return {object} a viewer double
   */
  function viewerWith(isolator) {
    return {
      isolator: {
        flattenChildren: jest.fn((id) => [id]),
        hideElementsById: jest.fn(),
        unHideElementsById: jest.fn(),
        ...isolator,
      },
    }
  }

  afterEach(() => {
    act(() => useStore.setState({viewer: null, hiddenElements: {}, hiddenOccurrenceKeys: {}}))
  })

  it('on a top-level STEP product\'s row, hides and shows the whole product (#1924)', () => {
    const viewer = viewerWith({hideProduct: jest.fn(() => true), unHideProduct: jest.fn(() => true)})
    act(() => useStore.setState({viewer, hiddenElements: {}}))
    render(<HideToggleButton elementId={7}/>)
    fireEvent.click(screen.getByTestId('hide-icon'))
    expect(viewer.isolator.hideProduct).toHaveBeenCalledWith(7)
    // The row's id owns no geometry: by id, the eye hid nothing.
    expect(viewer.isolator.hideElementsById).not.toHaveBeenCalled()

    // What the isolator publishes once the product is hidden (by the eye, or
    // by H on the row): the row's id, which the eye reads.
    act(() => useStore.setState({hiddenElements: {7: true}}))
    fireEvent.click(screen.getByTestId('unhide-icon'))
    expect(viewer.isolator.unHideProduct).toHaveBeenCalledWith(7)
    // By id, it found none of the product's ids hidden and did nothing.
    expect(viewer.isolator.unHideElementsById).not.toHaveBeenCalled()
  })

  it('on any other id-keyed row, hides by the row and its children\'s ids, as before', () => {
    const viewer = viewerWith({hideProduct: jest.fn(() => false), unHideProduct: jest.fn(() => false)})
    act(() => useStore.setState({viewer, hiddenElements: {}}))
    render(<HideToggleButton elementId={3}/>)
    fireEvent.click(screen.getByTestId('hide-icon'))
    // Asked first, and declined: the row is no top-level product.
    expect(viewer.isolator.hideProduct).toHaveBeenCalledWith(3)
    expect(viewer.isolator.hideElementsById).toHaveBeenCalledWith([3])
    act(() => useStore.setState({hiddenElements: {3: true}}))
    fireEvent.click(screen.getByTestId('unhide-icon'))
    expect(viewer.isolator.unHideProduct).toHaveBeenCalledWith(3)
    expect(viewer.isolator.unHideElementsById).toHaveBeenCalledWith([3])
  })
})
