# Spec: Navigation Tree (Spatial Structure)

## Overview
Hierarchical tree view of the IFC spatial structure. Users can browse IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → elements, select elements, and hide/show individual items.

## Key Files
| File | Role |
|------|------|
| `src/Components/NavTree/NavTreeNode.jsx` | Single tree node: expand/collapse, select, hide toggle |
| `src/Components/NavTree/` | Tree component folder |
| `src/store/NavTreeSlice.js` | Zustand: expanded nodes, navigation state |
| `src/utils/TreeUtils.js` | `setupLookupAndParentLinks()`, `getParentPathIdsForElement()` |
| `src/utils/ifc.js` | `groupElementsByTypes()` |

## Behavior
- Tree populated from `viewer.IFC.loader.ifcManager.getSpatialStructure()`
- Nodes labeled via `@bldrs-ai/ifclib` `reifyName()` for human-readable IFC names
- Clicking a node selects the element in the 3D view
- Expand/collapse with arrow icons
- Hide toggle button per node (uses IfcIsolator)
- Selection syncs bidirectionally: tree ↔ 3D viewer
- Virtual scrolling for large models

## IFC Data Flow
```
getSpatialStructure() → raw tree
  → setupLookupAndParentLinks() → lookup map + parent refs
    → groupElementsByTypes() → type-grouped children
      → NavTreeNode rendering
```
