import glbToThree from './glb'


describe('loader/glb', () => {
  it('returns the single root scene from a one-scene GLTF', () => {
    const scene = {name: 'theScene', children: []}
    const gltf = {scenes: [scene], animations: [], cameras: []}

    expect(glbToThree(gltf)).toBe(scene)
  })


  it('throws when the GLTF has multiple root scenes', () => {
    const gltf = {scenes: [{name: 'a'}, {name: 'b'}]}
    expect(() => glbToThree(gltf)).toThrow(/single GLTF scenes/)
  })


  it('throws when the GLTF has no scenes property at all', () => {
    expect(() => glbToThree({})).toThrow(/root scenes property/)
  })
})
