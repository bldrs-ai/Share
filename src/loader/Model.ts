/**
 * Model interface for generic model access
 * Supports heterogeneous data models via a common interface
 */


/**
 * Model interface for accessing model data
 */
export interface Model {
  /** Get the root element of the model */
  getRootElement(): Promise<Element>

  /** Get children for an element (spatial + geometric parts) */
  getChildren(elementID: number): Promise<Element[]>

  /**
   * Get properties for an element
   *
   * @return Properties object
   */
  getProperties(elementID: number): Promise<PropertyObject>

  /**
   * Get property sets for an element
   *
   * @return Array of property sets
   */
  getPropertySets(elementID: number): Promise<PropertySet[]>

  /**
   * Check if element has children
   *
   * @return True if element has children
   */
  hasChildren(elementID: number): Promise<boolean>

  /**
   * Get element by ID
   *
   * @return Element or null if not found
   */
  getElement(elementID: number): Promise<Element | null>
}


/**
 * Element in the model hierarchy
 */
export interface Element {
  elementID: number
  label?: string
  children?: Element[]
  [key: string]: unknown
}


/**
 * Geometric part of an element
 */
export interface GeometricPart {
  elementID: number
  parentElementID: number
  partIndex: number
  geometryElementID: number
  label: string
}


/**
 * Generic property object structure
 */
export interface PropertyObject {
  [key: string]: unknown
}


/**
 * Property set structure
 */
export interface PropertySet {
  Name?: {value?: string}
  [key: string]: unknown
}

