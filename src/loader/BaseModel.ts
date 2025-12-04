/**
 * Base Model implementation for Object3D-based models
 * Provides shared traversal logic for Three.js Object3D hierarchies
 */
import {Element, Model, PropertyObject, PropertySet} from './Model'


/**
 * Abstract base class implementing Model interface
 * Provides shared Object3D traversal logic
 */
export abstract class BaseModel implements Model {
  protected rootElementCache: Element | null = null

  /**
   * Get label from Object3D, preferring name property
   *
   * @return Label string or undefined
   */
  protected getLabel(obj3d: Object3DLike): string | undefined {
    // Prefer Object3D.name if present
    if (obj3d.name && obj3d.name.trim() !== '') {
      return obj3d.name
    }
    // Fall back to IFC-style Name/LongName
    if (obj3d.LongName?.value) {
      return obj3d.LongName.value
    }
    if (obj3d.Name?.value) {
      return obj3d.Name.value
    }
    return undefined
  }

  /**
   * Convert Object3D to Element
   *
   * @return Element representation
   */
  protected toElement(obj3d: Object3DLike): Element {
    const children: Element[] | undefined = Array.isArray(obj3d.children) ?
      obj3d.children.map((child) => this.toElement(child)) :
      undefined

    const label = this.getLabel(obj3d)
    const elementID = obj3d.expressID ?? 0

    // Preserve all properties (Name, LongName, type, etc.)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {children: _unused, ...rest} = obj3d

    const result: Element = {
      ...rest,
      elementID,
      expressID: elementID, // Set expressID for backward compatibility (same as elementID)
      label,
      children,
    }

    return result
  }

  /**
   * Find element by ID in tree
   *
   * @return Found element or null
   */
  protected findElementById(root: Element, elementID: number): Element | null {
    if (root.elementID === elementID) {
      return root
    }
    if (root.children) {
      for (const child of root.children) {
        const found = this.findElementById(child, elementID)
        if (found) {
          return found
        }
      }
    }
    return null
  }

  /**
   * Get root element - must be implemented by subclasses
   *
   * @return Root element
   */
  abstract getRootElement(): Promise<Element>

  /**
   * Get children for an element
   *
   * @return Array of child elements
   */
  async getChildren(elementID: number): Promise<Element[]> {
    const rootElt = await this.getRootElement()
    const element = this.findElementById(rootElt, elementID)
    return element?.children || []
  }

  /**
   * Get properties for an element
   * Default implementation returns empty object
   *
   * @return Properties object
   */
  async getProperties(_elementID: number): Promise<PropertyObject> {
    return await Promise.resolve({})
  }

  /**
   * Get property sets for an element
   * Default implementation returns empty array
   *
   * @return Array of property sets
   */
  async getPropertySets(_elementID: number): Promise<PropertySet[]> {
    return await Promise.resolve([])
  }

  /**
   * Check if element has children
   *
   * @return True if element has children
   */
  async hasChildren(elementID: number): Promise<boolean> {
    const children = await this.getChildren(elementID)
    return children.length > 0
  }

  /**
   * Get element by ID
   *
   * @return Element or null if not found
   */
  async getElement(elementID: number): Promise<Element | null> {
    const rootElt = await this.getRootElement()
    return this.findElementById(rootElt, elementID)
  }
}


/**
 * Object3D Model implementation
 * Handles generic Three.js Object3D hierarchies
 */
export class Object3DModel extends BaseModel {
  /**
   * @param object3d Root Object3D object
   */
  constructor(protected object3d: Object3DLike) {
    super()
  }

  /**
   * Get root element of the model
   *
   * @return Root element
   */
  async getRootElement(): Promise<Element> {
    if (this.rootElementCache) {
      return await Promise.resolve(this.rootElementCache)
    }
    this.rootElementCache = this.toElement(this.object3d)
    return await Promise.resolve(this.rootElementCache)
  }

  /**
   * Get properties for an element
   * Returns properties from Object3D if available
   *
   * @return Properties object
   */
  async getProperties(elementID: number): Promise<PropertyObject> {
    const element = await this.getElement(elementID)
    if (!element) {
      return {}
    }
    // Return element properties (excluding internal fields)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {elementID: _id, children: _children, label: _label, ...props} = element
    return props
  }
}


/**
 * Factory function to create Object3D Model instance
 *
 * @return Model interface implementation
 */
export function createObject3DModel(object3d: Object3DLike): Model {
  return new Object3DModel(object3d)
}


/**
 * Type for Three.js Object3D-like objects
 */
type Object3DLike = {
  name?: string
  children?: Object3DLike[]
  expressID?: number
  Name?: {value?: string}
  LongName?: {value?: string}
  type?: string
  [key: string]: unknown
}
