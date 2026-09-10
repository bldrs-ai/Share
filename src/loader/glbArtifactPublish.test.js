import useStore from '../store/useStore'
import {
  NESTED_LOAD_GENERATION,
  beginGlbArtifactLoad,
  currentGlbArtifactGeneration,
  publishGlbArtifact,
} from './glbArtifactPublish'


const ARTIFACT_A = {
  cacheKeyArgs: {ns1: 'gh-a', ns2: 'repo', ns3: 'main', sourcePath: 'a.ifc', sourceHash: 'sha-a'},
  schemaVer: '0.21.0-batched',
  writtenAt: 1,
}
const ARTIFACT_B = {...ARTIFACT_A, cacheKeyArgs: {...ARTIFACT_A.cacheKeyArgs, sourcePath: 'b.ifc'}}


/**
 * The `glbArtifact` slot is written by two producers that outlive the load
 * that started them — the fire-and-forget cache writer and the OPFS cache
 * reader — so an SPA navigation to a second model can be overtaken by the
 * first model's publish. That is the download the Export section then hands
 * the user (design/new/glb-export-premium.md §1.2).
 */
describe('glbArtifactPublish', () => {
  afterEach(() => {
    useStore.getState().setGlbArtifact(null)
  })

  it('publishes for the load that is still current', () => {
    const generation = beginGlbArtifactLoad()

    expect(publishGlbArtifact(ARTIFACT_A, generation)).toBe(true)
    expect(useStore.getState().glbArtifact).toBe(ARTIFACT_A)
  })

  it('clears the slot when a new load begins', () => {
    const generation = beginGlbArtifactLoad()
    publishGlbArtifact(ARTIFACT_A, generation)

    beginGlbArtifactLoad()

    expect(useStore.getState().glbArtifact).toBeNull()
  })

  it('drops a publish from a superseded load, keeping what the new load published', () => {
    // Model A's producer is still running when the user navigates to model B.
    const loadA = beginGlbArtifactLoad()
    const loadB = beginGlbArtifactLoad()
    publishGlbArtifact(ARTIFACT_B, loadB)

    expect(publishGlbArtifact(ARTIFACT_A, loadA)).toBe(false)
    expect(useStore.getState().glbArtifact).toBe(ARTIFACT_B)
  })

  it('drops a publish from a superseded load even when the new load has none', () => {
    // The common case for a format that produces no artifact at all: B left
    // the slot null, and A's late writer must not fill it in.
    const loadA = beginGlbArtifactLoad()
    beginGlbArtifactLoad()

    expect(publishGlbArtifact(ARTIFACT_A, loadA)).toBe(false)
    expect(useStore.getState().glbArtifact).toBeNull()
  })

  it('refuses a nested load\'s publish, leaving the outer load\'s artifact alone', () => {
    // `BLDLoader.parse` loads each object of a .bld assembly through its own
    // `load()`. Those loads have a cache artifact each; the assembly on
    // screen has none, and the last child to finish must not become what
    // "Download GLB" hands out (glbArtifactPublish.js module note).
    const outer = beginGlbArtifactLoad()
    publishGlbArtifact(ARTIFACT_A, outer)

    expect(publishGlbArtifact(ARTIFACT_B, NESTED_LOAD_GENERATION)).toBe(false)
    expect(useStore.getState().glbArtifact).toBe(ARTIFACT_A)
  })

  it('refuses a nested publish even when no load is current', () => {
    // The BLD case itself: the outer load published nothing (a .bld is not
    // an IFC), so an accepted child publish would fill an empty slot rather
    // than overwrite a full one — the same wrong download, harder to notice.
    beginGlbArtifactLoad()

    expect(publishGlbArtifact(ARTIFACT_A, NESTED_LOAD_GENERATION)).toBe(false)
    expect(useStore.getState().glbArtifact).toBeNull()
  })

  it('never collides with a real generation, however many loads have run', () => {
    // The sentinel is only safe because it can't be handed out as a
    // generation; a counter that could reach it would make nested publishes
    // start landing after N loads.
    for (let i = 0; i < 5; i++) {
      expect(beginGlbArtifactLoad()).not.toBe(NESTED_LOAD_GENERATION)
    }
    expect(currentGlbArtifactGeneration()).not.toBe(NESTED_LOAD_GENERATION)
  })

  it('hands out a new generation per load', () => {
    const first = beginGlbArtifactLoad()
    const second = beginGlbArtifactLoad()

    expect(second).not.toBe(first)
    expect(currentGlbArtifactGeneration()).toBe(second)
  })
})
