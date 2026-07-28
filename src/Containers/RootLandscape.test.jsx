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

// Mocked like the other child containers, but also out of necessity:
// the real TopBar mounts SearchBar, whose no-query cleanup effect
// reads the *global* location.search (empty under jsdom) and so
// navigates the MemoryRouter to a URL without ?feature=workspace,
// unmounting the flag-gated tree mid-test. Harmless in production
// where global and router locations agree.
jest.mock('./TopBar', () => ({
  __esModule: true,
  default: () => <div data-testid='TopBar'/>,
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

  // #1663: the ToolbarPaper placeholder becomes the real TopBar under
  // the flag; flag-off keeps the placeholder byte-identical.
  it('renders the ToolbarPaper placeholder by default, TopBar with ?feature=workspace', () => {
    const flagOff = render(
      <ShareMock>
        <RootLandscape pathPrefix='' branch='' selectWithShiftClickEvents={jest.fn()} deselectItems={jest.fn()}/>
      </ShareMock>,
    )
    expect(flagOff.getByTestId('RootLandscape-ToolbarPaper')).toBeInTheDocument()
    expect(flagOff.queryByTestId('TopBar')).toBeNull()
    flagOff.unmount()

    const flagOn = render(
      <ShareMock initialEntries={['/?feature=workspace']}>
        <RootLandscape pathPrefix='' branch='' selectWithShiftClickEvents={jest.fn()} deselectItems={jest.fn()}/>
      </ShareMock>,
    )
    expect(flagOn.getByTestId('TopBar')).toBeInTheDocument()
    expect(flagOn.queryByTestId('RootLandscape-ToolbarPaper')).toBeNull()
  })
})
