import {
  createDocument,
  saveDocument,
  getDocument,
  getDocumentsForModel,
  deleteDocument,
  createNewVersion,
} from './DocumentStore'


describe('DocumentStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates a document with default values', () => {
    const doc = createDocument({name: 'Test Plan', modelId: 'model-1'})
    expect(doc.id).toBeDefined()
    expect(doc.name).toBe('Test Plan')
    expect(doc.modelId).toBe('model-1')
    expect(doc.version).toBe(1)
    expect(doc.templateId).toBe('minimal')
    expect(doc.measurements).toEqual([])
  })

  it('persists and retrieves a document', () => {
    const doc = createDocument({name: 'Test', modelId: 'm1'})
    const retrieved = getDocument(doc.id)
    expect(retrieved.name).toBe('Test')
    expect(retrieved.id).toBe(doc.id)
  })

  it('updates a document on save', () => {
    const doc = createDocument({name: 'Original', modelId: 'm1'})
    doc.name = 'Updated'
    doc.measurements = [{type: 'distance', distance: 5}]
    saveDocument(doc)

    const retrieved = getDocument(doc.id)
    expect(retrieved.name).toBe('Updated')
    expect(retrieved.measurements).toHaveLength(1)
  })

  it('lists documents for a model', () => {
    createDocument({name: 'Plan A', modelId: 'model-1'})
    createDocument({name: 'Plan B', modelId: 'model-1'})
    createDocument({name: 'Other', modelId: 'model-2'})

    const docs = getDocumentsForModel('model-1')
    expect(docs).toHaveLength(2)
    expect(docs.map((d) => d.name).sort()).toEqual(['Plan A', 'Plan B'])
  })

  it('deletes a document', () => {
    const doc = createDocument({name: 'Delete Me', modelId: 'm1'})
    deleteDocument(doc.id)
    expect(getDocument(doc.id)).toBeNull()
  })

  it('increments version on createNewVersion', () => {
    const doc = createDocument({name: 'Versioned', modelId: 'm1'})
    expect(doc.version).toBe(1)

    const v2 = createNewVersion(doc)
    expect(v2.version).toBe(2)
    expect(v2.id).toBe(doc.id)

    const retrieved = getDocument(doc.id)
    expect(retrieved.version).toBe(2)
  })
})
