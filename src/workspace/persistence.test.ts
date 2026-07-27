import {
  loadWorkspaceProjects,
  newWorkspaceId,
  saveWorkspaceProjects,
} from './persistence'


describe('workspace/persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips projects through localStorage', () => {
    const projects = [
      {id: 'p1', name: 'Maple Street Tower', models: [
        {id: 'm1', label: 'tower.ifc', path: '/share/v/new/tower.ifc'},
      ]},
    ]
    saveWorkspaceProjects(projects)
    expect(loadWorkspaceProjects()).toEqual(projects)
  })

  it('returns empty on absence', () => {
    expect(loadWorkspaceProjects()).toEqual([])
  })

  it('returns empty on corrupt JSON', () => {
    localStorage.setItem('bldrs:workspace-projects', '{not json')
    expect(loadWorkspaceProjects()).toEqual([])
  })

  it('drops the store on version mismatch', () => {
    localStorage.setItem(
      'bldrs:workspace-projects',
      JSON.stringify({version: 999, projects: [{id: 'p1', name: 'x', models: []}]}),
    )
    expect(loadWorkspaceProjects()).toEqual([])
  })

  it('generates distinct ids', () => {
    expect(newWorkspaceId()).not.toBe(newWorkspaceId())
  })
})
