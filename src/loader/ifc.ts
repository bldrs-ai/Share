/**
 * IFC-specific implementation of Model interface
 */
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
 * Create IFC model implementation of Model interface
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
  // Cache for geometric parts to avoid re-fetching
  const geometricPartsCache = new Map<number, GeometricPart[]>()

  // Cache for spatial structure
  let rootElementCache: Element | null = null

  /**
   * Convert IFC element to generic Element
   *
   * @return Generic Element
   */
  function toElement(ifcElt: {
    expressID?: number
    children?: unknown[]
    [key: string]: unknown
  }): Element {
    const children: Element[] | undefined = Array.isArray(ifcElt.children) ?
      (ifcElt.children.map((child) =>
        toElement(child as {expressID?: number, children?: unknown[], [key: string]: unknown}),
      ) as Element[]) :
      undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {children: _unused, ...rest} = ifcElt
    const result: Element = {
      ...rest,
      elementID: ifcElt.expressID ?? 0,
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
  function partToElement(part: GeometricPart): Element {
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

  return {
    /**
     * Get the root element of the model
     *
     * @return Root element
     */
    async getRootElement(): Promise<Element> {
      if (rootElementCache) {
        return rootElementCache
      }
      if (!ifcManager?.getSpatialStructure) {
        throw new Error('IFC manager does not support getSpatialStructure')
      }
      // Pass true to include properties needed for reifyName labels
      // Warning is transient and only appears once during initial load
      const rootElt = await ifcManager.getSpatialStructure(0, true) as {expressID?: number, children?: unknown[], [key: string]: unknown}
      rootElementCache = toElement(rootElt)
      return rootElementCache
    },

    /**
     * Get children for an element (spatial + geometric parts)
     *
     * @return Array of child elements
     */
    async getChildren(elementID: number): Promise<Element[]> {
      // First get spatial children
      const rootElt = await this.getRootElement()

      /**
       * Find element in tree
       *
       * @return Found element or null
       */
      function findElement(node: Element): Element | null {
        if (node.elementID === elementID) {
          return node
        }
        if (node.children) {
          for (const child of node.children) {
            const found = findElement(child)
            if (found) {
              return found
            }
          }
        }
        return null
      }

      const element = findElement(rootElt)
      const spatialChildren = element?.children || []

      // Check if element has geometric parts and is a leaf node
      const hasParts = spatialChildren.length === 0 &&
        hasGeometricParts(elementID, ifcAPI)

      if (hasParts) {
        // Get geometric parts (use cache if available)
        let parts = geometricPartsCache.get(elementID)
        if (!parts) {
          parts = await getGeometricParts(elementID, ifcManager, ifcAPI, viewer)
          geometricPartsCache.set(elementID, parts)
        }
        // Combine spatial children (empty) with geometric parts
        return [...spatialChildren, ...parts.map(partToElement)]
      }

      return spatialChildren
    },

    async getProperties(elementID: number): Promise<PropertyObject> {
      if (!ifcManager?.getItemProperties) {
        return {}
      }
      const props = await ifcManager.getItemProperties(0, elementID, true) as PropertyObject
      return props || {}
    },

    async getPropertySets(elementID: number): Promise<PropertySet[]> {
      if (!ifcManager?.getPropertySets) {
        return []
      }
      const psets = await ifcManager.getPropertySets(0, elementID) as PropertySet[]
      return psets || []
    },

    async hasChildren(elementID: number): Promise<boolean> {
      const children = await this.getChildren(elementID)
      return children.length > 0
    },

    /**
     * Get element by ID
     *
     * @return Element or null if not found
     */
    async getElement(elementID: number): Promise<Element | null> {
      const rootElt = await this.getRootElement()

      /**
       * Find element in tree
       *
       * @return Found element or null
       */
      function findElement(node: Element): Element | null {
        if (node.elementID === elementID) {
          return node
        }
        if (node.children) {
          for (const child of node.children) {
            const found = findElement(child)
            if (found) {
              return found
            }
          }
        }
        return null
      }

      return findElement(rootElt)
    },
  }
}

