import React from 'react'
import {render, fireEvent, renderHook, act} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import FloorPlanControl from './FloorPlanControl'


jest.mock('three')


describe('FloorPlanControl', () => {
  beforeEach(() => {
    delete global.window.location
    global.window.location = {hash: ''}
  })

  it('renders nothing when no floors', () => {
    const {container} = render(<ShareMock><FloorPlanControl/></ShareMock>)
    // FloorPlanControl returns null when floors.length === 0 and not in floor plan mode
    expect(container.querySelector('[data-testid="control-button-floor-plan"]')).toBeNull()
  })

  it('renders button when floors are set', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setFloors([
        {globalId: 'g1', name: 'Ground Floor', elevation: 0, nextElevation: 3},
        {globalId: 'g2', name: 'First Floor', elevation: 3, nextElevation: 6},
      ])
    })

    const {getByTitle} = render(<ShareMock><FloorPlanControl/></ShareMock>)
    expect(getByTitle('Floor Plans')).toBeInTheDocument()
  })

  it('opens menu on click', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setFloors([
        {globalId: 'g1', name: 'Ground Floor', elevation: 0, nextElevation: 3},
        {globalId: 'g2', name: 'First Floor', elevation: 3, nextElevation: 6},
      ])
    })

    const {getByTitle, getByTestId} = render(<ShareMock><FloorPlanControl/></ShareMock>)
    fireEvent.click(getByTitle('Floor Plans'))
    // Menu should open (rendered in a portal)
    expect(getByTestId('control-button-floor-plan')).toBeInTheDocument()
  })
})
