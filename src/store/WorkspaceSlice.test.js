import createStore from 'zustand/vanilla'
import createWorkspaceSlice from './WorkspaceSlice'
import {loadWorkspaceProjects} from '../workspace/persistence'


/** @return {object} vanilla store containing only WorkspaceSlice */
function makeStore() {
  return createStore((set, get) => createWorkspaceSlice(set, get))
}


describe('store/WorkspaceSlice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty with no armed capture', () => {
    const state = makeStore().getState()
    expect(state.workspaceProjects).toEqual([])
    expect(state.workspaceCapture).toBeNull()
  })

  it('hydrates from localStorage at store creation', () => {
    makeStore().getState().createWorkspaceProject('Maple Street Tower')
    const rehydrated = makeStore().getState().workspaceProjects
    expect(rehydrated).toHaveLength(1)
    expect(rehydrated[0].name).toBe('Maple Street Tower')
  })

  it('creates and removes projects, persisting each mutation', () => {
    const store = makeStore()
    store.getState().createWorkspaceProject('A')
    store.getState().createWorkspaceProject('B')
    expect(store.getState().workspaceProjects.map((p) => p.name)).toEqual(['A', 'B'])

    const idA = store.getState().workspaceProjects[0].id
    store.getState().removeWorkspaceProject(idA)
    expect(store.getState().workspaceProjects.map((p) => p.name)).toEqual(['B'])
    expect(loadWorkspaceProjects().map((p) => p.name)).toEqual(['B'])
  })

  it('adds models, deduping by path (label refresh, no second row)', () => {
    const store = makeStore()
    store.getState().createWorkspaceProject('A')
    const projectId = store.getState().workspaceProjects[0].id

    store.getState().addWorkspaceModel(projectId, {label: 'x.ifc', path: '/share/v/new/x.ifc'})
    store.getState().addWorkspaceModel(projectId, {label: 'y.ifc', path: '/share/v/new/y.ifc'})
    store.getState().addWorkspaceModel(projectId, {label: 'x-renamed.ifc', path: '/share/v/new/x.ifc'})

    const models = store.getState().workspaceProjects[0].models
    expect(models.map((m) => m.label)).toEqual(['x-renamed.ifc', 'y.ifc'])
  })

  it('removes a model from the right project only', () => {
    const store = makeStore()
    store.getState().createWorkspaceProject('A')
    store.getState().createWorkspaceProject('B')
    const [projA, projB] = store.getState().workspaceProjects
    store.getState().addWorkspaceModel(projA.id, {label: 'x.ifc', path: '/v/x'})
    store.getState().addWorkspaceModel(projB.id, {label: 'x.ifc', path: '/v/x'})

    const modelIdA = store.getState().workspaceProjects[0].models[0].id
    store.getState().removeWorkspaceModel(projA.id, modelIdA)

    expect(store.getState().workspaceProjects[0].models).toHaveLength(0)
    expect(store.getState().workspaceProjects[1].models).toHaveLength(1)
  })

  it('arms and disarms capture', () => {
    const store = makeStore()
    store.getState().armWorkspaceCapture('p1', '/share')
    expect(store.getState().workspaceCapture).toMatchObject({projectId: 'p1', armedPathname: '/share'})
    store.getState().disarmWorkspaceCapture()
    expect(store.getState().workspaceCapture).toBeNull()
  })

  // Opening a model reloads the document (navigateToModel), so the arm
  // and the record happen in different page lifetimes.
  it('an armed capture survives a store re-creation (page reload)', () => {
    makeStore().getState().armWorkspaceCapture('p1', '/share')
    expect(makeStore().getState().workspaceCapture).toMatchObject({
      projectId: 'p1',
      armedPathname: '/share',
    })
  })

  it('a disarmed capture does not come back after reload', () => {
    const store = makeStore()
    store.getState().armWorkspaceCapture('p1', '/share')
    store.getState().disarmWorkspaceCapture()
    expect(makeStore().getState().workspaceCapture).toBeNull()
  })
})
