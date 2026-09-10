import useStore from '../store/useStore'
import {
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

  it('hands out a new generation per load', () => {
    const first = beginGlbArtifactLoad()
    const second = beginGlbArtifactLoad()

    expect(second).not.toBe(first)
    expect(currentGlbArtifactGeneration()).toBe(second)
  })
})
