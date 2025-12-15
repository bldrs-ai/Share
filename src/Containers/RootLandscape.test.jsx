import React from 'react'
import {render} from '@testing-library/react'
import ShareMock from '../ShareMock'
import RootLandscape from './RootLandscape'


jest.mock('./ControlsGroup', () => () => <div data-testid='MockControlsGroup'/>)
jest.mock('./OperationsGroup', () => () => <div data-testid='MockOperationsGroup'/>)


describe('RootLandscape', () => {
  it('center pane is flex and root does not overflow', () => {
    const {getByTestId} = render(
      <ShareMock>
        <RootLandscape
          pathPrefix=''
          branch=''
          selectWithShiftClickEvents={jest.fn()}
          deselectItems={jest.fn()}
        />
      </ShareMock>,
    )

    const root = getByTestId('RootLandscape-RootStack')
    const centerPane = getByTestId('CenterPane')

    expect(getComputedStyle(root).overflow).toBe('hidden')

    // Center pane should shrink when drawers grow.
    expect(getComputedStyle(centerPane).flexGrow).toBe('1')
    expect(getComputedStyle(centerPane).minWidth).toMatch(/^0(px)?$/)
  })
})
