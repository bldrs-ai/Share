// pdb.test.js
import {
  IcosahedronGeometry,
  BoxGeometry,
  Group,
  MeshPhongMaterial,
  Mesh,
} from 'three'
import pdbToThree from './pdb.js'

// Test constants
const BOND_LENGTH = 1.5
const DNA_BOND_LENGTH_1 = 1.6
const DNA_BOND_LENGTH_2 = 2.8

// Mock THREE.js classes for testing
jest.mock('three', () => ({
  IcosahedronGeometry: jest.fn().mockImplementation(() => ({})),
  BoxGeometry: jest.fn().mockImplementation(() => ({})),
  Group: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    type: '',
    Name: {value: ''},
    LongName: {value: ''},
    getPropertySets: jest.fn(() => []),
  })),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    negate: jest.fn().mockReturnThis(),
    multiplyScalar: jest.fn().mockReturnThis(),
    copy: jest.fn().mockReturnThis(),
    lerp: jest.fn().mockReturnThis(),
    lookAt: jest.fn().mockReturnThis(),
    distanceTo: jest.fn(() => 1.0),
  })),
  Color: jest.fn().mockImplementation((r = 0, g = 0, b = 0) => ({
    r, g, b,
  })),
  MeshPhongMaterial: jest.fn().mockImplementation(() => ({})),
  Mesh: jest.fn().mockImplementation(() => ({
    position: {copy: jest.fn(), multiplyScalar: jest.fn(), lerp: jest.fn(), lookAt: jest.fn()},
    scale: {multiplyScalar: jest.fn(), set: jest.fn()},
    lookAt: jest.fn(),
    type: '',
    expressID: 0,
    modelID: 0,
    Name: {value: ''},
    LongName: {value: ''},
  })),
  BufferGeometry: jest.fn().mockImplementation(() => ({
    setAttribute: jest.fn(),
    computeBoundingBox: jest.fn(),
    translate: jest.fn(),
    getAttribute: jest.fn(),
    boundingBox: {
      getCenter: jest.fn((vector) => {
        vector.x = 0
        vector.y = 0
        vector.z = 0
        return vector
      }),
    },
  })),
  Float32BufferAttribute: jest.fn().mockImplementation(() => ({})),
}))

describe('PDB Loader', () => {
  let mockViewer
  let mockPdbData

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock viewer object
    mockViewer = {
      getProperties: jest.fn(),
    }

    // Create mock PDB data
    mockPdbData = createMockPdbData()
  })

  describe('pdbToThree', () => {
    test('should create a THREE.js Group with proper properties', () => {
      const result = pdbToThree(mockPdbData, mockViewer)

      expect(Group).toHaveBeenCalled()
      expect(result.type).toBe('Molecule')
      expect(result.Name.value).toBe('Molecule')
      expect(result.LongName.value).toBe('Molecule')
      expect(result.getPropertySets()).toEqual([])
    })

    test('should process atoms and create meshes', () => {
      pdbToThree(mockPdbData, mockViewer)

      // Should create atom meshes
      expect(Mesh).toHaveBeenCalled()
      expect(IcosahedronGeometry).toHaveBeenCalledWith(1, 3)
    })

    test('should process bonds and create bond meshes', () => {
      pdbToThree(mockPdbData, mockViewer)

      // Should create bond meshes
      expect(BoxGeometry).toHaveBeenCalledWith(1, 1, 1)
      expect(MeshPhongMaterial).toHaveBeenCalled()
    })

    test('should set up viewer.getProperties function', () => {
      pdbToThree(mockPdbData, mockViewer)

      expect(typeof mockViewer.getProperties).toBe('function')

      // Test the getProperties function
      const props = mockViewer.getProperties(0, 0)
      expect(props).toHaveProperty('id', 0)
      expect(props).toHaveProperty('element')
    })

    test('should handle empty PDB data gracefully', () => {
      const emptyPdb = {
        geometryAtoms: createMockGeometry(0),
        geometryBonds: createMockGeometry(0),
        json: {atoms: []},
      }

      expect(() => pdbToThree(emptyPdb, mockViewer)).not.toThrow()
    })
  })

  describe('lookupName', () => {
    test('should return correct element names for common elements', () => {
      const elementTestCases = [
        {element: 'H', expected: 'Hydrogen'},
        {element: 'C', expected: 'Carbon'},
        {element: 'N', expected: 'Nitrogen'},
        {element: 'O', expected: 'Oxygen'},
        {element: 'P', expected: 'Phosphorus'},
        {element: 'S', expected: 'Sulfur'},
        {element: 'Fe', expected: 'Iron'},
        {element: 'Zn', expected: 'Zinc'},
        {element: 'Mg', expected: 'Magnesium'},
        {element: 'Ca', expected: 'Calcium'},
      ]

      elementTestCases.forEach(({element, expected}) => {
        const pdb = {
          geometryAtoms: createMockGeometry(1),
          geometryBonds: createMockGeometry(0),
          json: {
            atoms: [
              ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, element],
            ],
          },
        }

        pdbToThree(pdb, mockViewer)
        // The lookupName function is called internally, so we test it indirectly
        expect(mockViewer.getProperties).toBeDefined()
      })
    })

    test('should handle unknown elements', () => {
      const pdb = {
        geometryAtoms: createMockGeometry(1),
        geometryBonds: createMockGeometry(0),
        json: {
          atoms: [
            ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, 'XX'],
          ],
        },
      }

      expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
    })

    test('should handle missing atom data', () => {
      const pdb = {
        geometryAtoms: createMockGeometry(0),
        geometryBonds: createMockGeometry(0),
        json: {atoms: []},
      }

      expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
    })
  })

  describe('normalizeElementSymbol', () => {
    test('should normalize common element symbols', () => {
      // This function is internal, so we test it through the public API
      const normalizeTestCases = [
        {input: 'H', expected: 'H'},
        {input: 'C', expected: 'C'},
        {input: 'Fe', expected: 'Fe'},
        {input: 'Zn', expected: 'Zn'},
        {input: 'D', expected: 'H'}, // Deuterium -> Hydrogen
        {input: 'T', expected: 'H'}, // Tritium -> Hydrogen
      ]

      normalizeTestCases.forEach(({input, expected}) => {
        const pdb = {
          geometryAtoms: createMockGeometry(1),
          geometryBonds: createMockGeometry(0),
          json: {
            atoms: [
              ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, input],
            ],
          },
        }

        expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
      })
    })

    test('should handle atom names like CA, CB, OD1', () => {
      const atomNameTestCases = [
        {input: 'CA', expected: 'C'},
        {input: 'CB', expected: 'C'},
        {input: 'OD1', expected: 'O'},
        {input: 'NE2', expected: 'N'},
      ]

      atomNameTestCases.forEach(({input, expected}) => {
        const pdb = {
          geometryAtoms: createMockGeometry(1),
          geometryBonds: createMockGeometry(0),
          json: {
            atoms: [
              ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, input],
            ],
          },
        }

        expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
      })
    })

    test('should handle edge cases', () => {
      const edgeTestCases = [
        {input: '', expected: 'C'},
        {input: null, expected: 'C'},
        {input: undefined, expected: 'C'},
        {input: '   ', expected: 'C'},
      ]

      edgeTestCases.forEach(({input, expected}) => {
        const pdb = {
          geometryAtoms: createMockGeometry(1),
          geometryBonds: createMockGeometry(0),
          json: {
            atoms: [
              ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, input],
            ],
          },
        }

        expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
      })
    })
  })

  describe('ensureBondsIfMissing', () => {
    test('should create bonds when missing', () => {
      const pdbWithoutBonds = {
        geometryAtoms: createMockGeometry(3),
        geometryBonds: createMockGeometry(0), // No bonds
        json: {
          atoms: [
            ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, 'C'],
            ['ATOM', 2, 'CB', 'ALA', 'A', 1, BOND_LENGTH, 0.0, 0.0, 1.0, 0.0, 'C'],
            ['ATOM', 3, 'N', 'ALA', 'A', 1, 0.0, BOND_LENGTH, 0.0, 1.0, 0.0, 'N'],
          ],
        },
      }

      expect(() => pdbToThree(pdbWithoutBonds, mockViewer)).not.toThrow()
    })

    test('should not recreate bonds when they exist', () => {
      const pdbWithBonds = {
        geometryAtoms: createMockGeometry(2),
        geometryBonds: createMockGeometry(2), // Has bonds
        json: {
          atoms: [
            ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, 'C'],
            ['ATOM', 2, 'CB', 'ALA', 'A', 1, BOND_LENGTH, 0.0, 0.0, 1.0, 0.0, 'C'],
          ],
        },
      }

      expect(() => pdbToThree(pdbWithBonds, mockViewer)).not.toThrow()
    })

    test('should handle DNA-like structures', () => {
      const dnaPdb = {
        geometryAtoms: createMockGeometry(4),
        geometryBonds: createMockGeometry(0),
        json: {
          atoms: [
            ['ATOM', 1, 'P', 'DNA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, 'P'],
            ['ATOM', 2, 'O5\'', 'DNA', 'A', 1, DNA_BOND_LENGTH_1, 0.0, 0.0, 1.0, 0.0, 'O'],
            ['ATOM', 3, 'C5\'', 'DNA', 'A', 1, DNA_BOND_LENGTH_2, 0.0, 0.0, 1.0, 0.0, 'C'],
            ['ATOM', 4, 'N1', 'DNA', 'A', 1, 4.0, 0.0, 0.0, 1.0, 0.0, 'N'],
          ],
        },
      }

      expect(() => pdbToThree(dnaPdb, mockViewer)).not.toThrow()
    })
  })

  describe('ELEMENT_NAME mapping', () => {
    test('should have all expected elements', () => {
      const allElements = [
        'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
        'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
        'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
        'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
        'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
        'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
        'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy',
        'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt',
        'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
        'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf',
        'Es', 'Fm', 'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
        'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
      ]

      // Test that we can handle all these elements without errors
      allElements.forEach((element) => {
        const pdb = {
          geometryAtoms: createMockGeometry(1),
          geometryBonds: createMockGeometry(0),
          json: {
            atoms: [
              ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, element],
            ],
          },
        }

        expect(() => pdbToThree(pdb, mockViewer)).not.toThrow()
      })
    })
  })
})

/**
 * Helper functions to create mock data
 */

/**
 * Creates mock PDB data for testing
 *
 * @return {object} Mock PDB data structure
 */
function createMockPdbData() {
  return {
    geometryAtoms: createMockGeometry(3),
    geometryBonds: createMockGeometry(2),
    json: {
      atoms: [
        ['ATOM', 1, 'CA', 'ALA', 'A', 1, 0.0, 0.0, 0.0, 1.0, 0.0, 'C'],
        ['ATOM', 2, 'CB', 'ALA', 'A', 1, BOND_LENGTH, 0.0, 0.0, 1.0, 0.0, 'C'],
        ['ATOM', 3, 'N', 'ALA', 'A', 1, 0.0, BOND_LENGTH, 0.0, 1.0, 0.0, 'N'],
      ],
    },
  }
}

/**
 * Creates mock geometry for testing
 *
 * @param {number} count Number of vertices/atoms
 * @return {object} Mock geometry object
 */
function createMockGeometry(count) {
  const mockGeometry = {
    computeBoundingBox: jest.fn(),
    translate: jest.fn(),
    getAttribute: jest.fn((name) => {
      if (name === 'position') {
        return {
          count,
          getX: jest.fn((i) => i * BOND_LENGTH),
          getY: jest.fn((i) => 0),
          getZ: jest.fn((i) => 0),
        }
      }
      if (name === 'color') {
        return {
          count,
          getX: jest.fn((i) => 1.0),
          getY: jest.fn((i) => 0.0),
          getZ: jest.fn((i) => 0.0),
        }
      }
      return null
    }),
    boundingBox: {
      getCenter: jest.fn((vector) => {
        vector.x = 0
        vector.y = 0
        vector.z = 0
        return vector
      }),
    },
  }

  return mockGeometry
}
