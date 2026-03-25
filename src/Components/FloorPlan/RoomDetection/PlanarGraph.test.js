import {buildPlanarGraph, segmentIntersection} from './PlanarGraph'


describe('PlanarGraph', () => {
  describe('segmentIntersection', () => {
    it('finds intersection of crossing segments', () => {
      const p = segmentIntersection([0, 0], [4, 4], [0, 4], [4, 0])
      expect(p).not.toBeNull()
      expect(p[0]).toBeCloseTo(2)
      expect(p[1]).toBeCloseTo(2)
    })

    it('returns null for parallel segments', () => {
      const p = segmentIntersection([0, 0], [4, 0], [0, 1], [4, 1])
      expect(p).toBeNull()
    })

    it('returns null for non-intersecting segments', () => {
      const p = segmentIntersection([0, 0], [1, 0], [2, 2], [3, 2])
      expect(p).toBeNull()
    })
  })

  describe('buildPlanarGraph', () => {
    it('builds graph from a simple square of 4 segments', () => {
      // Four walls forming a square room
      const segments = [
        {p1: [0, 0], p2: [4, 0]}, // bottom
        {p1: [4, 0], p2: [4, 3]}, // right
        {p1: [4, 3], p2: [0, 3]}, // top
        {p1: [0, 3], p2: [0, 0]}, // left
      ]

      const graph = buildPlanarGraph(segments)
      expect(graph.nodes.size).toBe(4)
      expect(graph.edges.length).toBe(4)
    })

    it('handles T-junction (wall meeting wall)', () => {
      const segments = [
        {p1: [0, 0], p2: [6, 0]}, // horizontal wall
        {p1: [3, 0], p2: [3, 3]}, // vertical wall meeting at midpoint
      ]

      const graph = buildPlanarGraph(segments)
      // Should have 4 nodes: (0,0), (3,0), (6,0), (3,3)
      // And the horizontal wall should be split into two edges
      expect(graph.nodes.size).toBeGreaterThanOrEqual(4)
    })
  })
})
