import React from 'react'
import {render} from '@testing-library/react'
import ShareMock from '../ShareMock'
import RootLandscape from './RootLandscape'


jest.mock('./ControlsGroup', () => ({
  __esModule: true,
  default: () => <div data-testid='MockControlsGroup'/>,
}))

jest.mock('./OperationsGroup', () => ({
  __esModule: true,
  default: () => <div data-testid='MockOperationsGroup'/>,
}))

jest.mock('./ProjectsDrawer', () => ({
  __esModule: true,
  default: () => <div data-testid='MockProjectsDrawer'/>,
}))

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

  it('does not render ProjectsDrawer by default (flag-off layout unchanged)', () => {
    const {queryByTestId} = render(
      <ShareMock>
        <RootLandscape
          pathPrefix=''
          branch=''
          selectWithShiftClickEvents={jest.fn()}
          deselectItems={jest.fn()}
        />
      </ShareMock>,
    )
    expect(queryByTestId('MockProjectsDrawer')).toBeNull()
  })

  it('renders ProjectsDrawer leftmost with ?feature=workspace', () => {
    const {getByTestId} = render(
      <ShareMock initialEntries={['/?feature=workspace']}>
        <RootLandscape
          pathPrefix=''
          branch=''
          selectWithShiftClickEvents={jest.fn()}
          deselectItems={jest.fn()}
        />
      </ShareMock>,
    )
    const container = getByTestId('ProjectsDrawer-Container')
    expect(container).toBeInTheDocument()
    // Leftmost: the drawer container is the first child of the root stack.
    expect(getByTestId('RootLandscape-RootStack').firstChild).toBe(container)
  })
})
