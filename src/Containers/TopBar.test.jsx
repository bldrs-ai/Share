import React from 'react'
import {act, render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import TopBar from './TopBar'


const MODEL_ROUTE = '/share/v/p/index.ifc'

describe('TopBar', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => {
      useStore.setState({workspaceProjects: [], isSearchEnabled: true})
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

  it('carries the relocated SearchBar, honoring isSearchEnabled', () => {
    const withSearch = render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)
    expect(withSearch.getByTestId('topbar-search')).toBeInTheDocument()
    withSearch.unmount()

    act(() => {
      useStore.setState({isSearchEnabled: false})
    })
    const withoutSearch = render(<ShareMock initialEntries={[MODEL_ROUTE]}><TopBar/></ShareMock>)
    expect(withoutSearch.queryByTestId('topbar-search')).toBeNull()
  })

  // Element selections append numeric segments to the pathname; the
  // crumb must keep naming the model, not the selected expressID.
  it('names the model, not the selected element, on element-path routes', () => {
    render(<ShareMock initialEntries={[`${MODEL_ROUTE}/81/621`]}><TopBar/></ShareMock>)

    expect(screen.getByTestId('topbar-breadcrumb-model')).toHaveTextContent('index.ifc')
  })

  it('shows no breadcrumb segments off model routes', () => {
    render(<ShareMock initialEntries={['/about']}><TopBar/></ShareMock>)

    expect(screen.queryByTestId('topbar-breadcrumb-model')).toBeNull()
    expect(screen.queryByTestId('topbar-breadcrumb-project')).toBeNull()
  })
})
