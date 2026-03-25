/**
 * Floor Plan Document persistence via localStorage.
 *
 * Stores documents and custom templates as JSON.
 * Keyed by UUID, indexed by modelId for fast per-model lookups.
 */

const DOCS_KEY = 'bldrs-floorplan-documents'
const TEMPLATES_KEY = 'bldrs-floorplan-templates'


/**
 * Generate a UUID v4.
 *
 * @return {string}
 */
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
}


// --- Documents ---

function loadAllDocs() {
  try {
    return JSON.parse(localStorage.getItem(DOCS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveAllDocs(docs) {
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs))
}


/**
 * Create a new document.
 *
 * @param {object} data - partial document fields
 * @return {object} the created document
 */
export function createDocument(data) {
  const doc = {
    id: uuid(),
    name: data.name || 'Untitled',
    modelId: data.modelId || '',
    storeyName: data.storeyName || '',
    storeyElevation: data.storeyElevation || 0,
    templateId: data.templateId || 'minimal',
    scale: data.scale || 100,
    viewBox: data.viewBox || null,
    measurements: data.measurements || [],
    annotations: data.annotations || [],
    titleBlockValues: data.titleBlockValues || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  const docs = loadAllDocs()
  docs[doc.id] = doc
  saveAllDocs(docs)
  return doc
}


/**
 * Save (update) an existing document. Auto-save target.
 *
 * @param {object} doc - full document object with id
 */
export function saveDocument(doc) {
  const docs = loadAllDocs()
  doc.updatedAt = new Date().toISOString()
  docs[doc.id] = doc
  saveAllDocs(docs)
}


/**
 * Create a new version of a document.
 * Increments version number and updates timestamp.
 *
 * @param {object} doc
 * @return {object} the updated document
 */
export function createNewVersion(doc) {
  doc.version = (doc.version || 1) + 1
  doc.updatedAt = new Date().toISOString()
  const docs = loadAllDocs()
  docs[doc.id] = doc
  saveAllDocs(docs)
  return doc
}


/**
 * Get a document by ID.
 *
 * @param {string} id
 * @return {object|null}
 */
export function getDocument(id) {
  const docs = loadAllDocs()
  return docs[id] || null
}


/**
 * Get all documents for a given model.
 *
 * @param {string} modelId
 * @return {Array<object>}
 */
export function getDocumentsForModel(modelId) {
  const docs = loadAllDocs()
  return Object.values(docs)
    .filter((d) => d.modelId === modelId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}


/**
 * Delete a document by ID.
 *
 * @param {string} id
 */
export function deleteDocument(id) {
  const docs = loadAllDocs()
  delete docs[id]
  saveAllDocs(docs)
}


// --- Custom Templates ---

function loadCustomTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}')
  } catch {
    return {}
  }
}

/**
 * Save a custom template.
 *
 * @param {object} template
 */
export function saveCustomTemplate(template) {
  const templates = loadCustomTemplates()
  templates[template.id] = template
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

/**
 * Get all custom templates.
 *
 * @return {Array<object>}
 */
export function getCustomTemplates() {
  return Object.values(loadCustomTemplates())
}
