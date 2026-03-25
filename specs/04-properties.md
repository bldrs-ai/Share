# Spec: Properties Panel

## Overview
Displays IFC property sets for the selected element. Recursively renders nested property tables from the IFC data model.

## Key Files
| File | Role |
|------|------|
| `src/Components/Properties/itemProperties.jsx` | `createPropertyTable()` — recursive table builder |
| `src/store/PropertiesSlice.js` | Zustand: selected element properties state |

## Behavior
- Triggered when an element is selected in the viewer or nav tree
- Calls `viewer.getSelectedElementsProps(selectedElements)` to fetch IFC properties
- Uses `@bldrs-ai/ifclib` `deref()` and `decodeIFCString()` for value parsing
- Renders nested tables for property sets (IfcPropertySet, IfcPropertySingleValue, etc.)
- Shows IFC Type, expressID, GlobalId, and all associated properties

## Data Flow
```
element selection → getSelectedElementsProps() → IFC property objects
  → createPropertyTable() → prettyProps() (recursive)
    → React table rows
```
