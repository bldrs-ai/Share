import React from 'react'
import {act, fireEvent, render, screen, waitForElementToBeRemoved} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {ID_RESIZE_HANDLE_X} from '../Components/SideDrawer/HorizonResizerButton'
import ProjectsDrawer from './ProjectsDrawer'
import {TOP_BAR_HEIGHT} from './layoutConstants'


describe('ProjectsDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => {
      useStore.setState({
        workspaceProjects: [],
        workspaceCapture: null,
        isOpenModelVisible: false,
        expandedProjectIds: [],
        isWorkspaceDrawerCollapsed: false,
      })
    })
  })

  describe('resize', () => {
    // Regression: the drag handlers used to sit on the grip dots alone,
    // so a drag started anywhere else along the edge did nothing.
    it('resizes when the edge is dragged, not just the grip dots', () => {
      render(<ShareMock><ProjectsDrawer/></ShareMock>)
      const edge = screen.getByTestId(ID_RESIZE_HANDLE_X)

      act(() => {
        fireEvent.mouseDown(edge)
      })
      act(() => {
        fireEvent.mouseMove(window, {clientX: 400})
      })

      // jsdom rects are all zero, so width tracks clientX less the grip.
      const clearlyWiderThanInitial = 300
      expect(useStore.getState().workspaceDrawerWidth).toBeGreaterThan(clearlyWiderThanInitial)
    })

    it('collapses when dragged narrower than the minimum', () => {
      render(<ShareMock><ProjectsDrawer/></ShareMock>)
      const edge = screen.getByTestId(ID_RESIZE_HANDLE_X)

      act(() => {
        fireEvent.mouseDown(edge)
      })
      act(() => {
        fireEvent.mouseMove(window, {clientX: 30})
      })

      expect(useStore.getState().isWorkspaceDrawerCollapsed).toBe(true)
    })
  })

  it('aligns its header with the top bar', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)
    expect(screen.getByTestId('projects-header'))
      .toHaveStyle({height: `${TOP_BAR_HEIGHT}px`})
  })

  describe('collapse', () => {
    it('collapses to a rail and back, persisting the choice', () => {
      render(<ShareMock><ProjectsDrawer/></ShareMock>)

      expect(screen.getByTestId('projects-new-button')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('projects-collapse-toggle'))

      // Rail keeps only the toggle: brand and project UI are drawer-open
      // affordances.
      expect(screen.queryByTestId('projects-new-button')).toBeNull()
      expect(screen.queryByTestId('workspace-logo-button')).toBeNull()
      expect(screen.getByTestId('projects-collapse-toggle')).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('bldrs:workspace-ui')).isDrawerCollapsed).toBe(true)

      fireEvent.click(screen.getByTestId('projects-collapse-toggle'))
      expect(screen.getByTestId('projects-new-button')).toBeInTheDocument()
    })

    it('starts collapsed when that was the stored preference', () => {
      act(() => {
        useStore.getState().setIsWorkspaceDrawerCollapsed(true)
      })
      render(<ShareMock><ProjectsDrawer/></ShareMock>)
      expect(screen.queryByTestId('projects-new-button')).toBeNull()
    })
  })

  it('persists which projects are expanded', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    // Created projects start expanded and persisted.
    expect(JSON.parse(localStorage.getItem('bldrs:workspace-ui')).expandedProjectIds)
      .toEqual([projectId])

    fireEvent.click(screen.getByTestId(`project-${projectId}`))
    expect(useStore.getState().expandedProjectIds).toEqual([])
    expect(JSON.parse(localStorage.getItem('bldrs:workspace-ui')).expandedProjectIds).toEqual([])

    fireEvent.click(screen.getByTestId(`project-${projectId}`))
    expect(JSON.parse(localStorage.getItem('bldrs:workspace-ui')).expandedProjectIds)
      .toEqual([projectId])
  })

  // A model recorded before its name was known keeps a storage-id label;
  // resolving at render repairs the display without a migration.
  it('renders a stored storage-id label as the model name', () => {
    localStorage.setItem('bldrs:recent-files', JSON.stringify({
      version: 1,
      files: [{
        id: 'abc-uuid.ifc',
        source: 'local',
        name: 'haus.ifc',
        sharePath: '/share/v/new/abc-uuid.ifc',
      }],
    }))
    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().addWorkspaceModel(projectId, {
        label: 'abc-uuid.ifc',
        path: '/share/v/new/abc-uuid.ifc',
      })
    })

    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    expect(screen.getByText('haus.ifc')).toBeInTheDocument()
    expect(screen.queryByText('abc-uuid.ifc')).toBeNull()
  })

  it('creates a project through the New project dialog and persists it', async () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    fireEvent.click(screen.getByTestId('projects-new-button'))
    fireEvent.change(screen.getByTestId('projects-new-name'), {target: {value: 'Maple Street Tower'}})
    fireEvent.click(screen.getByTestId('projects-new-create'))

    expect(screen.getByText('Maple Street Tower')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('bldrs:workspace-projects')).projects[0].name)
      .toBe('Maple Street Tower')
    // The dialog is done once the project exists (MUI fades it out).
    await waitForElementToBeRemoved(() => screen.queryByTestId('projects-new-create'))
  })

  it('closes the dialog when created with the Enter key', async () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    fireEvent.click(screen.getByTestId('projects-new-button'))
    fireEvent.change(screen.getByTestId('projects-new-name'), {target: {value: 'Via keyboard'}})
    fireEvent.keyDown(screen.getByTestId('projects-new-name'), {key: 'Enter'})

    await waitForElementToBeRemoved(() => screen.queryByTestId('projects-new-create'))
    expect(useStore.getState().workspaceProjects[0].name).toBe('Via keyboard')
  })

  // A new project is empty; Add model lives inside it, so it has to be
  // reachable without a further click.
  it('opens a newly created project so Add model is visible', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    fireEvent.click(screen.getByTestId('projects-new-button'))
    fireEvent.change(screen.getByTestId('projects-new-name'), {target: {value: 'Fresh'}})
    fireEvent.click(screen.getByTestId('projects-new-create'))

    const projectId = useStore.getState().workspaceProjects[0].id
    expect(screen.getByTestId(`project-add-model-${projectId}`)).toBeInTheDocument()
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

    fireEvent.click(screen.getByTestId(`project-add-model-${projectId}`))

    expect(useStore.getState().workspaceCapture.projectId).toBe(projectId)
    expect(useStore.getState().isOpenModelVisible).toBe(true)
  })

  // Regression: OpenModelDialog#openFile closes the dialog synchronously
  // while the OS file picker is still open, so treating "dialog closed"
  // as abandonment disarmed every capture before the model could load.
  it('keeps the capture armed when the Open dialog closes', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    fireEvent.click(screen.getByTestId(`project-add-model-${projectId}`))
    expect(useStore.getState().workspaceCapture).not.toBeNull()

    act(() => {
      useStore.getState().setIsOpenModelVisible(false)
    })
    expect(useStore.getState().workspaceCapture).not.toBeNull()
  })

  it('records the opened model when a model route renders while armed', () => {
    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().armWorkspaceCapture(projectId, '/share')
    })

    // Mounting at the model route stands in for the post-open page load.
    render(
      <ShareMock initialEntries={['/share/v/new/haus.ifc']}>
        <ProjectsDrawer/>
      </ShareMock>,
    )

    const models = useStore.getState().workspaceProjects[0].models
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({label: 'haus.ifc', path: '/share/v/new/haus.ifc'})
    expect(useStore.getState().workspaceCapture).toBeNull()
  })

  // Local uploads route by OPFS storage id, so the raw segment is a UUID.
  it('labels a captured model with its recents display name', () => {
    localStorage.setItem('bldrs:recent-files', JSON.stringify({
      version: 1,
      files: [{
        id: 'e500a57d-d0e1-4d5d-8187-56388a548971.ifc',
        source: 'local',
        name: 'haus.ifc',
        sharePath: '/share/v/new/e500a57d-d0e1-4d5d-8187-56388a548971.ifc',
      }],
    }))
    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().armWorkspaceCapture(projectId, '/share')
    })

    render(
      <ShareMock initialEntries={['/share/v/new/e500a57d-d0e1-4d5d-8187-56388a548971.ifc']}>
        <ProjectsDrawer/>
      </ShareMock>,
    )

    expect(useStore.getState().workspaceProjects[0].models[0].label).toBe('haus.ifc')
  })

  it('does not record a non-model route', () => {
    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().armWorkspaceCapture(projectId, '/share')
    })

    render(<ShareMock initialEntries={['/share/about']}><ProjectsDrawer/></ShareMock>)

    expect(useStore.getState().workspaceProjects[0].models).toHaveLength(0)
    expect(useStore.getState().workspaceCapture).not.toBeNull()
  })

  it('disarms when an already-listed model is clicked', () => {
    render(<ShareMock><ProjectsDrawer/></ShareMock>)

    act(() => {
      useStore.getState().createWorkspaceProject('A')
    })
    const projectId = useStore.getState().workspaceProjects[0].id
    act(() => {
      useStore.getState().addWorkspaceModel(projectId, {label: 'tower.ifc', path: '/share/v/new/tower.ifc'})
      useStore.getState().armWorkspaceCapture('other-project', '/share')
    })

    fireEvent.click(screen.getByText('tower.ifc'))

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
