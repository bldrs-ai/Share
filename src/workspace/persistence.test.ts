import {
  loadWorkspaceCapture,
  loadWorkspaceContents,
  newWorkspaceId,
  saveWorkspaceCapture,
  saveWorkspaceContents,
} from './persistence'


describe('workspace/persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips projects and ungrouped models through localStorage', () => {
    const contents = {
      projects: [
        {id: 'p1', name: 'Maple Street Tower', models: [
          {id: 'm1', label: 'tower.ifc', path: '/share/v/new/tower.ifc'},
        ]},
      ],
      ungrouped: [{id: 'u1', label: 'shared.ifc', path: '/share/v/gh/o/r/main/shared.ifc'}],
    }
    saveWorkspaceContents(contents)
    expect(loadWorkspaceContents()).toEqual(contents)
  })

  it('returns empty on absence', () => {
    expect(loadWorkspaceContents()).toEqual({projects: [], ungrouped: []})
  })

  // A model may legitimately be filed under two projects, so the
  // element-path normalization below must not dedup across them.
  it('keeps a model that is filed under more than one project', () => {
    const shared = {id: 'm1', label: 'shared.ifc', path: '/share/v/gh/o/r/main/shared.ifc'}
    saveWorkspaceContents({
      projects: [
        {id: 'p1', name: 'One', models: [shared]},
        {id: 'p2', name: 'Two', models: [{...shared, id: 'm2'}]},
      ],
      ungrouped: [],
    })
    const loaded = loadWorkspaceContents()
    expect(loaded.projects[0].models).toHaveLength(1)
    expect(loaded.projects[1].models).toHaveLength(1)
  })

  // Early builds recorded raw pathnames, so element selections minted
  // phantom "models" named by expressID. Loads self-heal those stores.
  it('normalizes element-path refs onto their model and drops duplicates', () => {
    saveWorkspaceContents({
      projects: [
        {id: 'p1', name: 'Maple', models: [
          {id: 'm1', label: 'Momentum.ifc', path: '/share/v/gh/o/r/main/Momentum.ifc'},
          {id: 'm2', label: '199961', path: '/share/v/gh/o/r/main/Momentum.ifc/88/111/199961'},
        ]},
      ],
      ungrouped: [
        {id: 'u1', label: 'index.ifc', path: '/share/v/p/index.ifc'},
        {id: 'u2', label: '621', path: '/share/v/p/index.ifc/81/621'},
        // A project's copy of the model wins over an Ungrouped one.
        {id: 'u3', label: '153', path: '/share/v/gh/o/r/main/Momentum.ifc/153'},
      ],
    })
    expect(loadWorkspaceContents()).toEqual({
      projects: [
        {id: 'p1', name: 'Maple', models: [
          {id: 'm1', label: 'Momentum.ifc', path: '/share/v/gh/o/r/main/Momentum.ifc'},
        ]},
      ],
      ungrouped: [
        {id: 'u1', label: 'index.ifc', path: '/share/v/p/index.ifc'},
      ],
    })
  })

  it('returns empty on corrupt JSON', () => {
    localStorage.setItem('bldrs:workspace-projects', '{not json')
    expect(loadWorkspaceContents()).toEqual({projects: [], ungrouped: []})
  })

  it('drops the store on version mismatch', () => {
    localStorage.setItem(
      'bldrs:workspace-projects',
      JSON.stringify({version: 999, projects: [{id: 'p1', name: 'x', models: []}]}),
    )
    expect(loadWorkspaceContents()).toEqual({projects: [], ungrouped: []})
  })

  // Stores written before Ungrouped existed must still load.
  it('defaults ungrouped when the stored document predates it', () => {
    localStorage.setItem(
      'bldrs:workspace-projects',
      JSON.stringify({version: 1, projects: [{id: 'p1', name: 'x', models: []}]}),
    )
    expect(loadWorkspaceContents().ungrouped).toEqual([])
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
