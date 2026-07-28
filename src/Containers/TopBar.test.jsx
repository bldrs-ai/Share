import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import TopBar from './TopBar'


const MODEL_ROUTE = '/share/v/p/index.ifc'

describe('TopBar', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => {
      useStore.setState({workspaceProjects: [], isSearchEnabled: true, model: null, selectedElement: null})
    })
  })

  it('shows the model breadcrumb segment on a model route', () => {
    render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('index.ifc')
    expect(screen.queryByTestId('topbar-breadcrumb-project')).toBeNull()
  })

  it('shows the project segment when the model is filed in a project', () => {
    act(() => {
      useStore.getState().createWorkspaceProject('Maple Street')
      const project = useStore.getState().workspaceProjects[0]
      useStore.getState().addWorkspaceModel(project.id, {label: 'index.ifc', path: MODEL_ROUTE})
    })
    render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-project')).toHaveTextContent('Maple Street')
    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('index.ifc')
  })

  it('offers search as an icon, opening the field only on click', () => {
    render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)

    expect(screen.queryByTestId('topbar-search')).toBeNull()
    fireEvent.click(screen.getByTestId('topbar-search-open'))

    expect(screen.getByTestId('topbar-search')).toBeInTheDocument()
    expect(screen.queryByTestId('topbar-search-open')).toBeNull()
  })

  it('honors isSearchEnabled', () => {
    act(() => {
      useStore.setState({isSearchEnabled: false})
    })
    render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)

    expect(screen.queryByTestId('topbar-search-open')).toBeNull()
    expect(screen.queryByTestId('topbar-search')).toBeNull()
  })

  // Hover only *offers* the move — the icon it reveals must be clicked.
  it('reveals a search icon on the hovered crumb, without moving the field', () => {
    act(() => {
      useStore.setState({
        model: {name: 'Bldrs'},
        selectedElement: {expressID: 396, type: 'IFCBUILDINGELEMENTPROXY', Name: {value: 'Together'}},
      })
    })
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/89/112`]}><TopBar/></ShareMock>)

    // At rest the icon sits on the leaf crumb.
    expect(screen.getByTestId('topbar-search-open')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-search-slot-model')).toBeInTheDocument()

    // Hovering the model crumb moves the icon there — one icon at a
    // time — but the field has not opened or moved.
    fireEvent.mouseEnter(screen.getByTestId('topbar-breadcrumb-model').parentElement)
    expect(screen.getByTestId('topbar-search-slot-element')).toBeInTheDocument()
    expect(screen.queryByTestId('topbar-search')).toBeNull()
    expect(screen.getByTestId('topbar-breadcrumb-element')).toBeInTheDocument()

    // Clicking it commits: the field opens there and clears the crumbs
    // to its right.
    fireEvent.click(screen.getByTestId('topbar-search-open'))
    expect(screen.getByTestId('topbar-search')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-breadcrumb-model')).toBeInTheDocument()
    expect(screen.queryByTestId('topbar-breadcrumb-element')).toBeNull()
  })

  // Dismissing returns to the initial placement, not the last one used.
  it('restores the icon to the leaf after the search is dismissed', () => {
    act(() => {
      useStore.setState({
        model: {name: 'Bldrs'},
        selectedElement: {expressID: 396, type: 'IFCBUILDINGELEMENTPROXY', Name: {value: 'Together'}},
      })
    })
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/89/112`]}><TopBar/></ShareMock>)

    fireEvent.mouseEnter(screen.getByTestId('topbar-breadcrumb-model').parentElement)
    fireEvent.click(screen.getByTestId('topbar-search-open'))
    expect(screen.queryByTestId('topbar-breadcrumb-element')).toBeNull()

    fireEvent.keyDown(screen.getByTestId('textfield-search-query'), {key: 'Escape'})

    expect(screen.queryByTestId('topbar-search')).toBeNull()
    expect(screen.getByTestId('topbar-breadcrumb-element')).toBeInTheDocument()
    // Back at the leaf, not parked where the search last was.
    expect(screen.getByTestId('topbar-search-slot-model')).toBeInTheDocument()
  })

  // Element selections append numeric segments to the pathname; the
  // crumb must keep naming the model, not the selected expressID.
  it('names the model, not the selected element, on element-path routes', () => {
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/81/621`]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('index.ifc')
  })

  it('prefers the loader-extracted model name over the filename', () => {
    act(() => {
      useStore.setState({model: {name: 'Bldrs'}})
    })
    render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('Bldrs')
  })

  it('adds a named-element crumb for the current selection', () => {
    act(() => {
      useStore.setState({
        model: {name: 'Bldrs'},
        selectedElement: {expressID: 396, type: 'IFCBUILDINGELEMENTPROXY', Name: {value: 'Together'}},
      })
    })
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/89/112/139/154/396`]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('Bldrs')
    expect(screen.getByTestId('topbar-breadcrumb-element')).toHaveTextContent('Together')
  })

  it('falls back to prettified type and id for anonymous elements', () => {
    act(() => {
      useStore.setState({
        selectedElement: {expressID: 42, type: 'IFCWALLSTANDARDCASE'},
      })
    })
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/81/42`]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-element')).toHaveTextContent('Wall (std. case): 42')
  })

  it('shows no breadcrumb segments off model routes', () => {
    render(<ShareMock initialEntries={['/about']}><TopBar/></ShareMock>)

    expect(screen.queryByTestId('topbar-breadcrumb-model')).toBeNull()
    expect(screen.queryByTestId('topbar-breadcrumb-project')).toBeNull()
  })
})
