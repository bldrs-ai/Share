import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import ProjectsDrawer from './ProjectsDrawer'


describe('ProjectsDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => {
      useStore.setState({workspaceProjects: [], workspaceCapture: null, isOpenModelVisible: false})
    })
  })

  it('creates a project through the New project dialog and persists it', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    fireEvent.click(screen.getByTestId('projects-new-button'))
    fireEvent.change(screen.getByTestId('projects-new-name'), {target: {value: 'Maple Street Tower'}})
    fireEvent.click(screen.getByTestId('projects-new-create'))

    expect(screen.getByText('Maple Street Tower')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('bldrs:workspace-projects')).projects[0].name)
      .toBe('Maple Street Tower')
  })

  it('ignores a blank project name', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    fireEvent.click(screen.getByTestId('projects-new-button'))
    fireEvent.change(screen.getByTestId('projects-new-name'), {target: {value: '   '}})
    fireEvent.click(screen.getByTestId('projects-new-create'))

    expect(useStore.getState().workspaceProjects).toHaveLength(0)
  })

  it('Add model arms capture for the project and opens the Open dialog', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id

    fireEvent.click(screen.getByTestId(`project-${projectId}`))
    fireEvent.click(screen.getByTestId(`project-add-model-${projectId}`))

    expect(useStore.getState().workspaceCapture.projectId).toBe(projectId)
    expect(useStore.getState().isOpenModelVisible).toBe(true)
  })

  it('disarms capture when the Open dialog closes without navigation', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    fireEvent.click(screen.getByTestId(`project-${projectId}`))
    fireEvent.click(screen.getByTestId(`project-add-model-${projectId}`))
    expect(useStore.getState().workspaceCapture).not.toBeNull()

    act(() => {
      useStore.getState().setIsOpenModelVisible(false)
    })
    expect(useStore.getState().workspaceCapture).toBeNull()
  })

  it('expands a project to list models and removes them', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().addWorkspaceModel(projectId, {label: 'tower.ifc', path: '/share/v/new/tower.ifc'})
    })

    fireEvent.click(screen.getByTestId(`project-${projectId}`))
    expect(screen.getByText('tower.ifc')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Remove model tower.ifc'))
    expect(screen.queryByText('tower.ifc')).toBeNull()
    expect(useStore.getState().workspaceProjects[0].models).toHaveLength(0)
  })

  it('deletes a project', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('Doomed')
    })
    fireEvent.click(screen.getByLabelText('Delete project Doomed'))
    expect(useStore.getState().workspaceProjects).toHaveLength(0)
  })
})
