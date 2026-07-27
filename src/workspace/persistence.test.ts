import {
  loadWorkspaceCapture,
  loadWorkspaceProjects,
  newWorkspaceId,
  saveWorkspaceCapture,
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


describe('workspace capture persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips an armed capture', () => {
    const capture = {projectId: 'p1', armedPathname: '/share', armedAtMs: Date.now()}
    saveWorkspaceCapture(capture)
    expect(loadWorkspaceCapture()).toEqual(capture)
  })

  it('clears on null', () => {
    saveWorkspaceCapture({projectId: 'p1', armedPathname: '/share', armedAtMs: Date.now()})
    saveWorkspaceCapture(null)
    expect(loadWorkspaceCapture()).toBeNull()
  })

  it('drops a capture older than the TTL', () => {
    // TTL is 10 minutes; this puts the capture safely past it.
    const msPerMinute = 60_000
    const minutesPastTtl = 11
    const elevenMinutesMs = minutesPastTtl * msPerMinute
    saveWorkspaceCapture({
      projectId: 'p1',
      armedPathname: '/share',
      armedAtMs: Date.now() - elevenMinutesMs,
    })
    expect(loadWorkspaceCapture()).toBeNull()
  })

  it('returns null on corrupt or shapeless data', () => {
    localStorage.setItem('bldrs:workspace-capture', '{not json')
    expect(loadWorkspaceCapture()).toBeNull()
    localStorage.setItem('bldrs:workspace-capture', JSON.stringify({nope: true}))
    expect(loadWorkspaceCapture()).toBeNull()
  })
})
