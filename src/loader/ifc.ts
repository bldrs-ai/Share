/**
 * IFC-specific implementation of Model interface
 */
import {BaseModel} from './BaseModel'
import {Element, GeometricPart, Model, PropertyObject, PropertySet} from './Model'


/**
 * Check if element has multiple geometric parts
 *
 * @return True if element has multiple geometric parts
 */
function hasGeometricParts(elementID: number, ifcAPI: {GetFlatMesh?: (modelID: number, expressID: number) => unknown}): boolean {
  if (!ifcAPI?.GetFlatMesh) {
    return false
  }
  try {
    // eslint-disable-next-line new-cap
    const flatMesh = ifcAPI.GetFlatMesh(0, elementID) as {geometries?: {size?: () => number}}
    const geometries = flatMesh?.geometries
    const size = typeof geometries?.size === 'function' ? geometries.size() : 0
    return size > 1
  } catch (error) {
    return false
  }
}


/**
 * Get placed geometry express IDs from flat mesh
 *
 * @return Array of geometry express IDs
 */
function getPlacedGeometryIds(
  parentElementID: number,
  ifcAPI: {GetFlatMesh?: (modelID: number, expressID: number) => unknown},
): number[] {
  if (!ifcAPI?.GetFlatMesh) {
    return []
  }
  try {
    // eslint-disable-next-line new-cap
    const flatMesh = ifcAPI.GetFlatMesh(0, parentElementID) as {
      geometries?: {
        size?: () => number
        get?: (index: number) => {geometryExpressID?: number}
      }
    }
    const geometries = flatMesh?.geometries
    const size = typeof geometries?.size === 'function' ? geometries.size() : 0
    if (!size) {
      return []
    }
    const geometryElementIDs: number[] = []
    for (let idx = 0; idx < size; idx += 1) {
      const placedGeometry = geometries?.get?.(idx)
      const geometryElementID = placedGeometry?.geometryExpressID
      if (Number.isFinite(geometryElementID)) {
        geometryElementIDs.push(geometryElementID as number)
      }
    }
    return geometryElementIDs
  } catch (error) {
    console.warn('Failed to resolve placed geometries for element', parentElementID, error)
    return []
  }
}


/**
 * Get geometric parts for an element
 *
 * @return Array of geometric parts
 */
async function getGeometricParts(
  elementID: number,
  ifcManager: {getItemProperties?: (modelID: number, expressID: number, includeProperties: boolean) => Promise<unknown>},
  ifcAPI: {GetFlatMesh?: (modelID: number, expressID: number) => unknown},
  viewer?: {
    registerGeometricPart?: (
      partExpressID: number,
      metadata: {parentExpressID: number, modelID: number, partIndex: number, geometryExpressID: number}
    ) => void
  },
): Promise<GeometricPart[]> {
  if (!ifcManager?.getItemProperties) {
    return []
  }
  try {
    const props = await ifcManager.getItemProperties(0, elementID, true) as {
      Representation?: {
        Representations?: Array<{
          RepresentationIdentifier?: {value?: string}
          Items?: Array<{expressID?: number}>
        }>
      }
    }
    const parts: GeometricPart[] = []
    const representations = props?.Representation?.Representations || []

    for (const rep of representations) {
      const isBody = rep?.RepresentationIdentifier?.value === 'Body'
      const items = Array.isArray(rep?.Items) ? rep.Items : []
      if (!isBody || items.length <= 1) {
        continue
      }

      const placedGeometryIds = getPlacedGeometryIds(elementID, ifcAPI)
      items.forEach((item, idx) => {
        if (typeof item?.expressID !== 'number') {
          return
        }
        const geometryElementID = Number.isFinite(placedGeometryIds[idx]) ? placedGeometryIds[idx] : item.expressID
        const part: GeometricPart = {
          elementID: item.expressID,
          parentElementID: elementID,
          partIndex: idx,
          geometryElementID,
          label: `Part ${idx + 1}`,
        }
        parts.push(part)

        // Register with viewer if available
        viewer?.registerGeometricPart?.(item.expressID, {
          parentExpressID: elementID,
          modelID: 0,
          partIndex: idx,
          geometryExpressID: geometryElementID,
        })
      })
      break
    }

    return parts
  } catch (error) {
    console.warn('Failed to load geometric parts for element:', elementID, error)
    return []
  }
}


/**
 * IFC Model implementation extending BaseModel
 */
export class IfcModel extends BaseModel {
  private geometricPartsCache = new Map<number, GeometricPart[]>()

  /**
   * @param ifcModel Root IFC model object
   * @param ifcManager IFC manager for accessing IFC data
   * @param ifcAPI IFC API for geometric operations
   * @param viewer Optional viewer for geometric part registration
   */
  constructor(
    private ifcModel: {
      expressID?: number
      children?: Array<{expressID?: number, [key: string]: unknown}>
    },
    private ifcManager: {
      getSpatialStructure?: (modelID: number, includeProperties: boolean) => Promise<unknown>
      getItemProperties?: (modelID: number, expressID: number, includeProperties: boolean) => Promise<unknown>
      getPropertySets?: (modelID: number, expressID: number) => Promise<unknown[]>
    },
    private ifcAPI: {GetFlatMesh?: (modelID: number, expressID: number) => unknown},
    private viewer?: {
      registerGeometricPart?: (
        partExpressID: number,
        metadata: {parentExpressID: number, modelID: number, partIndex: number, geometryExpressID: number}
      ) => void
    },
  ) {
    super()
  }

  /**
   * Convert IFC element to generic Element
   * Override BaseModel's toElement to handle IFC-specific structure
   *
   * @return Generic Element
   */
  protected toElement(ifcElt: {
    expressID?: number
    children?: unknown[]
    [key: string]: unknown
  }): Element {
    const children: Element[] | undefined = Array.isArray(ifcElt.children) ?
      (ifcElt.children.map((child) =>
        this.toElement(child as {expressID?: number, children?: unknown[], [key: string]: unknown}),
      ) as Element[]) :
      undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {children: _unused, ...rest} = ifcElt
    const elementID = ifcElt.expressID ?? 0
    const result: Element = {
      ...rest,
      elementID,
      expressID: elementID, // Set expressID for backward compatibility (same as elementID)
      label: (ifcElt as {Name?: {value?: string}}).Name?.value,
      children,
    }
    return result
  }

  /**
   * Convert geometric part to Element
   *
   * @return Element representation of geometric part
   */
  private partToElement(part: GeometricPart): Element {
    return {
      elementID: part.elementID,
      label: part.label,
      children: [],
      parentElementID: part.parentElementID,
      partIndex: part.partIndex,
      geometryElementID: part.geometryElementID,
      isGeometricPart: true,
    }
  }

  /**
   * Get the root element of the model
   *
   * @return Root element
   */
  async getRootElement(): Promise<Element> {
    if (this.rootElementCache) {
      return this.rootElementCache
    }
    if (!this.ifcManager?.getSpatialStructure) {
      throw new Error('IFC manager does not support getSpatialStructure')
    }
    // Pass true to include properties needed for reifyName labels
    // Warning is transient and only appears once during initial load
    const rootElt = await this.ifcManager.getSpatialStructure(0, true) as {expressID?: number, children?: unknown[], [key: string]: unknown}
    this.rootElementCache = this.toElement(rootElt)
    return this.rootElementCache
  }

  /**
   * Get children for an element (spatial + geometric parts)
   * Override BaseModel to handle geometric parts
   *
   * @return Array of child elements
   */
  async getChildren(elementID: number): Promise<Element[]> {
    // First get spatial children using base implementation
    const spatialChildren = await super.getChildren(elementID)

    // Check if element has geometric parts and is a leaf node
    const hasParts = spatialChildren.length === 0 &&
      hasGeometricParts(elementID, this.ifcAPI)

    if (hasParts) {
      // Get geometric parts (use cache if available)
      let parts = this.geometricPartsCache.get(elementID)
      if (!parts) {
        parts = await getGeometricParts(elementID, this.ifcManager, this.ifcAPI, this.viewer)
        this.geometricPartsCache.set(elementID, parts)
      }
      // Combine spatial children (empty) with geometric parts
      return [...spatialChildren, ...parts.map((part) => this.partToElement(part))]
    }

    return spatialChildren
  }

  /**
   * Get properties for an element
   * Override BaseModel to use IFC manager
   *
   * @return Properties object
   */
  async getProperties(elementID: number): Promise<PropertyObject> {
    if (!this.ifcManager?.getItemProperties) {
      return {}
    }
    const props = await this.ifcManager.getItemProperties(0, elementID, true) as PropertyObject
    return props || {}
  }

  /**
   * Get property sets for an element
   * Override BaseModel to use IFC manager
   *
   * @return Array of property sets
   */
  async getPropertySets(elementID: number): Promise<PropertySet[]> {
    if (!this.ifcManager?.getPropertySets) {
      return []
    }
    const psets = await this.ifcManager.getPropertySets(0, elementID) as PropertySet[]
    return psets || []
  }
}


/**
 * Factory function to create IFC Model instance
 *
 * @return Model interface implementation
 */
export function createIfcModel(
  ifcModel: {
    expressID?: number
    children?: Array<{expressID?: number, [key: string]: unknown}>
  },
  ifcManager: {
    getSpatialStructure?: (modelID: number, includeProperties: boolean) => Promise<unknown>
    getItemProperties?: (modelID: number, expressID: number, includeProperties: boolean) => Promise<unknown>
    getPropertySets?: (modelID: number, expressID: number) => Promise<unknown[]>
  },
  ifcAPI: {GetFlatMesh?: (modelID: number, expressID: number) => unknown},
  viewer?: {
    registerGeometricPart?: (
      partExpressID: number,
      metadata: {parentExpressID: number, modelID: number, partIndex: number, geometryExpressID: number}
    ) => void
  },
): Model {
  return new IfcModel(ifcModel, ifcManager, ifcAPI, viewer)
}

