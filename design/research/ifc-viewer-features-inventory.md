# IFC/BIM Viewer Features Inventory

**Research Date:** 2026-03-23
**Purpose:** Comprehensive inventory of features offered by major 3D IFC model viewers in the AEC industry

## Viewers Analyzed

| # | Viewer | Type | License |
|---|--------|------|---------|
| 1 | **xeokit** | Web SDK (WebGL) | Open source (AGPL/commercial) |
| 2 | **Autodesk Viewer (APS)** | Web SDK (cloud-rendered) | Proprietary (subscription) |
| 3 | **BIMcollab ZOOM** | Desktop + WebViewer | Free viewer / paid features |
| 4 | **Trimble Connect** | Cloud platform (web/desktop/mobile) | Freemium |
| 5 | **Solibri** | Desktop (Java) | Commercial (free viewer) |
| 6 | **BIM Vision** | Desktop (Windows) | Freeware |
| 7 | **That Open Engine (IFC.js)** | Web SDK (WebGL, client-side) | Open source (MIT/MPL-2.0) |
| 8 | **Speckle** | Cloud platform + web viewer | Open source (server + viewer) |
| 9 | **Dalux** | Cloud + mobile (field-focused) | Free viewer / paid field tools |
| 10 | **Catenda Hub (Bimsync)** | Cloud platform (SaaS) | Commercial |

---

## 1. Viewing & Navigation

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Orbit** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Pan** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Zoom** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Fit to view / Zoom extents** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Perspective / Orthographic toggle** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **First-person / Walk mode** | Y | - | Y | Y | Y | Y | - | - | - | - | Nice-to-have |
| **Fly-through / Camera path** | Y | - | - | - | - | - | - | - | - | - | Nice-to-have |
| **NavCube (orientation cube)** | Y | Y | Y | Y | - | Y | - | - | - | - | Must-have |
| **Plan views / Storey navigation** | Y | Y | Y | Y | Y | Y | Y | - | Y | Y | Must-have |
| **Saved viewpoints / Camera bookmarks** | Y | Y | Y | Y | Y | Y | - | Y | Y | Y | Must-have |
| **Minimap** | Y | Y | - | - | - | - | Y | - | - | - | Nice-to-have |
| **Keyboard shortcuts** | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Nice-to-have |
| **Touch support (mobile)** | Y | Y | Y | Y | - | - | Y | Y | Y | Y | Must-have |

### Notes
- **xeokit** has the richest programmable camera system: orbit, firstPerson, planView modes, CameraFlightAnimation, CameraPathAnimation, and NavCube/Gnomon gizmos.
- **Autodesk APS** navigation is feature-rich out of the box with extensions for minimap and aerial view.
- **Solibri** offers pan, orbit, walk, and "game mode" (WASD-style movement).
- **Dalux** is optimized for mobile-first navigation on construction sites.

---

## 2. Selection & Querying

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Click-to-select (pick)** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Multi-select** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Selection basket / Set** | - | - | Y | - | Y | - | - | - | - | - | Nice-to-have |
| **Search by property** | - | Y | Y | Y | Y | Y | - | Y | Y | Y | Must-have |
| **Filter by IFC type** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Filter by storey/level** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Filter by material** | - | Y | Y | Y | Y | Y | - | Y | Y | Y | Nice-to-have |
| **Smart Views (property-based rules)** | - | - | Y | - | Y | - | - | Y | Y | - | Nice-to-have |
| **Spatial queries / Raycasting** | Y | Y | - | - | - | - | Y | - | - | - | Nice-to-have |

### Notes
- **BIMcollab ZOOM** Smart Views are a standout: rule-based filter+color+hide+transparency actions applied to any IFC property.
- **Solibri** has the most sophisticated selection: selection basket with add/subtract/set operations, plus rule-based filtering via classifications.
- **That Open Engine** provides programmatic raycasting and ItemsFinder components for developers.

---

## 3. Section & Clipping

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Single clipping plane (X/Y/Z)** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Multiple clipping planes** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Section box (6-plane clip)** | Y | Y | Y | Y | Y | Y | - | Y | Y | Y | Must-have |
| **Interactive plane dragging** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Click-surface to place plane** | Y | Y | - | - | - | - | Y | - | - | - | Nice-to-have |
| **Capped section fill** | - | Y | Y | - | Y | - | - | - | - | - | Nice-to-have |
| **2D floor plan generation** | Y | Y | Y | - | Y | - | Y | - | Y | Y | Nice-to-have |

### Notes
- **Section box** (6-sided clipping volume) is nearly universal and considered a must-have.
- **Autodesk APS** provides capped sections with fill display, giving a "cut drawing" appearance.
- **BIMcollab** and **Solibri** both generate filled sections that look like traditional 2D plans.
- **xeokit** SectionPlanesPlugin supports unlimited planes with interactive control widgets.

---

## 4. Measurement

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Point-to-point distance** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Perpendicular / shortest distance** | - | Y | Y | Y | Y | Y | - | - | Y | Y | Must-have |
| **Angle measurement** | Y | Y | - | Y | Y | Y | Y | - | - | - | Nice-to-have |
| **Area measurement** | - | Y | Y | Y | Y | Y | - | - | - | - | Nice-to-have |
| **Volume measurement** | - | - | - | - | Y | - | - | - | - | - | Nice-to-have |
| **Coordinate readout (XYZ)** | - | Y | Y | Y | Y | Y | - | - | Y | - | Nice-to-have |
| **Snap to edge / vertex** | - | Y | Y | Y | Y | Y | - | - | - | - | Must-have |
| **Persistent dimensions** | - | Y | Y | Y | Y | Y | - | - | Y | - | Nice-to-have |
| **Calibration** | - | Y | - | - | - | - | - | - | - | - | Nice-to-have |

### Notes
- **Solibri** has the most complete measurement toolkit: distance, angle, face area, enclosed area, and volume.
- **BIMcollab ZOOM** offers laser, point-to-point, and coordinate modes plus a distance-checking validation tool.
- **Dalux** specifically highlights on-site measurement capability for field use.
- **Autodesk APS** Quick Measure extension provides automatic snapping to edges and faces.

---

## 5. Visualization

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **X-ray / Transparency** | Y | Y | Y | Y | Y | Y | Y | - | - | - | Must-have |
| **Object isolation (show only)** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Object hiding** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Color override per object** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Auto color by property** | - | - | Y | - | Y | - | - | Y | Y | Y | Nice-to-have |
| **Color legend** | - | - | Y | - | Y | - | - | Y | Y | - | Nice-to-have |
| **Explode view** | - | Y | - | - | - | - | Y | Y | - | - | Nice-to-have |
| **Highlight on hover** | Y | Y | Y | Y | Y | Y | Y | Y | - | Y | Must-have |
| **Ambient shadows** | Y | Y | - | - | - | - | Y | Y | - | - | Nice-to-have |
| **PBR materials** | Y | Y | - | - | - | - | - | - | - | - | Nice-to-have |
| **Wireframe mode** | Y | Y | - | - | Y | Y | - | Y | - | - | Nice-to-have |
| **Edge display** | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Nice-to-have |
| **Light controls** | Y | Y | - | - | - | - | - | Y | - | - | Nice-to-have |

### Notes
- **X-ray/Ghosting** is a defining BIM viewer feature: making non-selected objects semi-transparent to maintain spatial context.
- **BIMcollab ZOOM** Smart Views provide the richest property-based auto-coloring (e.g., color by fire rating, by material, by classification).
- **Autodesk APS** supports advanced rendering with PBR, depth of field, and ambient occlusion.
- **Speckle** has view modes and light controls in a central toolbar.

---

## 6. Annotation & Markup

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **3D annotations / Pins** | Y | - | Y | Y | - | - | - | Y | - | - | Nice-to-have |
| **2D markup on screenshot** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Must-have |
| **Text labels** | Y | Y | Y | Y | - | - | - | Y | - | - | Nice-to-have |
| **Arrows / Lines** | - | Y | Y | Y | - | - | - | Y | Y | Y | Nice-to-have |
| **Shapes (rect, circle, cloud)** | - | Y | Y | Y | - | - | - | - | - | - | Nice-to-have |
| **Freehand drawing** | - | Y | - | - | - | - | - | Y | - | Y | Nice-to-have |
| **Property stamps** | - | - | Y | - | - | - | - | - | - | - | Nice-to-have |
| **Redlining** | - | Y | - | Y | - | - | - | - | Y | Y | Nice-to-have |
| **Undo/Redo for markups** | - | Y | - | - | - | - | - | - | - | - | Nice-to-have |
| **Persistent / Saveable markups** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Nice-to-have |

### Notes
- **Autodesk APS** MarkupsCore extension is the most fully-featured: arrows, circles, clouds, freehand, highlight, pen, polyline, rectangle, text, with edit/view modes and layer management.
- **BIMcollab ZOOM** uniquely offers property stamps that display IFC property values directly as annotations.
- **Speckle** recently added drawing and annotation capabilities directly in the 3D viewer.
- **Trimble Connect** integrates markup with its to-do/issue workflow.

---

## 7. Collaboration

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **BCF import/export** | Y | - | Y | Y | Y | Y | - | - | Y | Y | Must-have |
| **BCF-API (server)** | - | - | Y | Y | - | - | - | - | - | Y | Nice-to-have |
| **BCF viewpoints (camera+state)** | Y | - | Y | Y | Y | Y | - | - | Y | Y | Must-have |
| **Issue tracking** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Must-have |
| **Comments on model** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Must-have |
| **Shared sessions / Live collab** | - | Y | - | Y | - | - | - | Y | - | - | Nice-to-have |
| **Real-time follow mode** | - | - | - | Y | - | - | - | Y | - | - | Nice-to-have |
| **Cloud storage / CDE** | - | Y | Y | Y | - | - | - | Y | Y | Y | Nice-to-have |
| **Role-based access control** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Nice-to-have |
| **Notifications / Alerts** | - | Y | Y | Y | - | - | - | Y | Y | Y | Nice-to-have |
| **Audit trail** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Nice-to-have |

### Notes
- **BCF (BIM Collaboration Format)** is the industry standard for issue communication between BIM tools. Support is essential for interoperability.
- **BIMcollab** is the leading BCF platform with Nexus as a dedicated BCF server and real-time sync across devices.
- **Trimble Connect** Live Collaboration allows multiple users to see each other's views in real-time.
- **Speckle** takes a different approach: live model synchronization replaces file-based exchange.
- **xeokit** provides BCF viewpoint save/load but is a viewer SDK, not a collaboration platform.

---

## 8. Data & Properties

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Property inspector panel** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **IFC property sets** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **IFC type/entity tree** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Spatial containment tree** | Y | Y | Y | Y | Y | Y | Y | - | Y | Y | Must-have |
| **Layer tree** | Y | Y | Y | Y | Y | Y | - | - | - | Y | Nice-to-have |
| **System/Group tree** | - | Y | - | - | Y | - | - | - | - | Y | Nice-to-have |
| **IFC base quantities** | - | - | Y | Y | Y | Y | - | - | Y | Y | Must-have |
| **Quantity takeoff (QTO)** | - | - | Y | - | Y | Y | - | - | - | Y | Nice-to-have |
| **QTO export (Excel/CSV)** | - | - | Y | - | Y | Y | - | - | - | Y | Nice-to-have |
| **Classification systems** | - | - | Y | - | Y | - | Y | - | - | - | Nice-to-have |
| **Material information** | - | Y | Y | Y | Y | Y | - | Y | Y | Y | Nice-to-have |
| **Custom/computed properties** | - | - | Y | - | Y | - | - | - | - | - | Nice-to-have |

### Notes
- **Solibri** has the deepest property inspection: six info tabs (BIM Data, IFC Header, IFC Standard Properties, IFC Standard Quantities, Other Properties, Custom) plus full Information Takeoff with Excel templates.
- **BIMcollab ZOOM** Smart Properties allow creating computed/derived properties from existing attributes.
- **Catenda Hub** provides five tree views (containment, component, type, layer, system) for comprehensive model navigation.
- **BIM Vision** Advanced Reports plugin enables property-based summary reports.

---

## 9. Comparison & Versioning

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Clash detection** | - | Y | Y | Y | Y | Y | - | - | - | Y | Must-have |
| **Clash grouping / Filtering** | - | Y | Y | Y | Y | - | - | - | - | - | Nice-to-have |
| **Clash to BCF issue** | - | Y | Y | Y | Y | Y | - | - | - | Y | Nice-to-have |
| **Model version compare** | - | Y | - | Y | Y | Y | - | Y | Y | Y | Nice-to-have |
| **Change highlighting** | - | Y | - | - | Y | Y | - | Y | Y | - | Nice-to-have |
| **Clearance / Distance checks** | - | - | Y | Y | Y | - | - | - | - | - | Nice-to-have |
| **Rule-based checking** | - | - | Y | - | Y | - | - | - | - | - | Nice-to-have |
| **IDS validation** | - | - | Y | - | Y | - | - | - | - | - | Nice-to-have |
| **Multi-model federation** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Point cloud vs. model compare** | - | - | Y | - | - | - | - | - | Y | - | Nice-to-have |

### Notes
- **Solibri** is the industry leader for model checking: 70+ rule templates covering geometry, clearance, accessibility, compliance, fire safety, and more.
- **BIMcollab ZOOM** offers clash detection plus IDS (Information Delivery Specification) validation for checking data quality.
- **BIM Vision** "Change" module automatically classifies changes between model versions into groups by change type.
- **Speckle** version comparison leverages its commit-based version history.
- **Multi-model federation** (loading and combining multiple IFC files from different disciplines) is universal and essential.

---

## 10. Export & Integration

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Screenshot capture** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **PDF export** | - | Y | Y | Y | Y | Y | - | - | - | - | Nice-to-have |
| **Excel/CSV export** | - | - | Y | Y | Y | Y | - | - | - | Y | Nice-to-have |
| **BCF export (.bcf file)** | Y | - | Y | Y | Y | Y | - | - | Y | Y | Must-have |
| **IFC export/roundtrip** | - | - | - | - | - | - | Y | - | - | - | Nice-to-have |
| **JavaScript / REST API** | Y | Y | Y | Y | Y | Y | Y | Y | - | Y | Must-have |
| **Embeddable viewer** | Y | Y | Y | - | - | - | Y | Y | - | - | Nice-to-have |
| **Plugin / Extension system** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Must-have |
| **Power BI integration** | - | - | Y | - | - | - | - | Y | - | - | Nice-to-have |
| **Connectors (Revit, ArchiCAD, etc.)** | - | Y | Y | Y | Y | - | - | Y | Y | Y | Nice-to-have |
| **Webhook / Automation** | - | Y | Y | Y | - | - | - | Y | - | Y | Nice-to-have |
| **80+ format support** | - | Y | - | Y | - | - | - | - | Y | - | Nice-to-have |

### Notes
- **Autodesk APS** leads in format breadth (80+ formats) and API extensibility with a rich extension framework.
- **xeokit** is purpose-built as an embeddable SDK with full JavaScript API control.
- **That Open Engine** provides IFC read/write at native speeds, unique among web viewers.
- **Speckle** has the broadest connector ecosystem (Revit, Rhino, Grasshopper, Blender, SketchUp, AutoCAD, etc.).

---

## 11. Performance

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Large model handling (100k+ objects)** | Y | Y | Y | Y | Y | Y | Y | - | Y | Y | Must-have |
| **Progressive / Streamed loading** | Y | Y | - | Y | - | - | - | Y | Y | Y | Must-have |
| **Compact binary format** | Y | Y | - | - | - | - | Y | - | - | - | Nice-to-have |
| **GPU instancing** | Y | Y | - | - | - | - | - | - | - | - | Nice-to-have |
| **Geometry batching** | Y | Y | - | - | - | - | Y | - | - | - | Nice-to-have |
| **LOD (Level of Detail)** | - | Y | - | - | - | - | - | - | - | - | Nice-to-have |
| **Double-precision coordinates** | Y | - | - | - | - | - | - | - | - | - | Nice-to-have |
| **WebGL rendering** | Y | Y | - | Y | - | - | Y | Y | Y | Y | N/A (web) |
| **Client-side (no server)** | Y | - | - | - | - | - | Y | - | - | - | Nice-to-have |
| **Offline capable** | - | - | Y | Y | Y | Y | Y | - | Y | - | Nice-to-have |
| **Point cloud support** | Y | Y | Y | Y | - | - | - | - | Y | - | Nice-to-have |

### Notes
- **xeokit** is specifically engineered for large model performance: XKT binary format, GPU instancing, geometry batching, and double-precision for GIS integration.
- **Autodesk APS** uses cloud rendering pipeline with SVF/SVF2 formats optimized for streaming.
- **That Open Engine** uses Fragments format (based on Google Flatbuffers) for efficient binary storage.
- **Dalux** claims to handle 1 million+ individual BIM models on screen simultaneously.
- **BIMcollab ZOOM** desktop app handles large federated models without web streaming.

---

## 12. Mobile & Field

| Feature | xeokit | APS | BIMcollab | Trimble | Solibri | BIM Vision | ThatOpen | Speckle | Dalux | Catenda | Priority |
|---------|--------|-----|-----------|---------|---------|------------|----------|---------|-------|---------|----------|
| **Mobile app (iOS/Android)** | - | - | - | Y | Y | - | - | - | Y | - | Nice-to-have |
| **Mobile web viewer** | Y | Y | Y | Y | - | - | Y | Y | Y | Y | Must-have |
| **Offline mode** | - | - | Y | Y | Y | Y | Y | - | Y | - | Nice-to-have |
| **AR (Augmented Reality)** | - | - | - | Y | - | - | - | - | Y | - | Nice-to-have |
| **VR support** | - | Y | - | - | - | - | - | - | - | - | Nice-to-have |
| **QR code integration** | - | - | Y | - | - | - | - | - | Y | - | Nice-to-have |
| **Field issue capture** | - | - | Y | Y | Y | - | - | - | Y | - | Nice-to-have |
| **Photo attachment to issues** | - | Y | Y | Y | Y | - | - | - | Y | Y | Nice-to-have |
| **On-site measurement** | - | - | - | Y | - | - | - | Y | Y | - | Nice-to-have |
| **2D/3D overlay** | - | - | - | - | - | - | - | - | Y | - | Nice-to-have |
| **Checklists / Inspections** | - | - | - | Y | - | - | - | - | Y | - | Nice-to-have |

### Notes
- **Dalux** is the clear leader in field/mobile features: AR (TwinBIM), QR codes for locations/rooms, offline sync, 2D/3D overlay, checklists, and field issue capture.
- **Trimble Connect** AR viewer enables on-site BIM overlay with mobile devices.
- **BIMcollab** QR codes link to document version verification.
- **Speckle** measurement tool works on tablets and smartphones.

---

## Summary: Feature Tiers for a Modern IFC Viewer

### Tier 1 — Must-Have (Table Stakes)

Every competitive IFC viewer must have these features:

1. **Orbit, pan, zoom, fit-to-view** — Basic 3D navigation
2. **Perspective/orthographic toggle** — Camera projection modes
3. **Click-to-select and multi-select** — Object picking
4. **IFC spatial/type tree** — Hierarchical model navigation
5. **Property inspector** — View IFC property sets on selection
6. **Filter by type and storey** — Basic model filtering
7. **Object isolation and hiding** — Show/hide individual elements
8. **X-ray / Transparency** — See through non-selected objects
9. **Color override** — Recolor objects manually
10. **Highlight on hover** — Visual feedback on mouse-over
11. **Single + multiple clipping planes** — Section through model
12. **Section box** — 6-plane clipping volume
13. **Point-to-point distance** — Basic measurement
14. **Snap to edges/vertices** — Measurement precision
15. **Screenshot capture** — Export current view as image
16. **BCF viewpoint save/load** — Industry-standard collaboration
17. **Multi-model federation** — Load and combine multiple IFC files
18. **Touch support** — Mobile/tablet usability
19. **Storey/plan navigation** — Floor-by-floor browsing
20. **Saved viewpoints** — Camera state bookmarks
21. **2D markup on screenshots** — Annotate captured views
22. **Issue tracking / Comments** — Communication on model elements
23. **API / SDK** — Programmatic extensibility
24. **Plugin/Extension system** — Third-party feature additions
25. **Progressive loading** — Handle large models without timeout
26. **NavCube** — Orientation reference widget

### Tier 2 — Expected (Competitive Differentiators)

Features that separate good viewers from basic ones:

1. **Search by property value** — Find elements by attribute
2. **Clash detection** — Identify geometric conflicts
3. **BCF issue workflow** — Full create/assign/track/close cycle
4. **IFC base quantities** — Display embedded quantity data
5. **Auto-color by property** — Rule-based visualization
6. **Perpendicular/shortest distance** — Advanced measurement
7. **Angle measurement** — Beyond simple distance
8. **Area measurement** — Surface or enclosed area
9. **Persistent dimensions** — Saved measurement annotations
10. **Model version comparison** — Detect changes between revisions
11. **3D annotations / Pins** — Spatial markers in the model
12. **PDF/Excel export** — Report generation
13. **Federated model filtering** — Per-discipline visibility
14. **Classification systems** — Uniclass, OmniClass, etc.
15. **Material information** — Display material properties
16. **Mobile web viewer** — Responsive browser experience
17. **Offline mode** — Work without internet connection

### Tier 3 — Advanced (Market Leadership)

Features for premium/specialized use cases:

1. **First-person / Walk mode** — Architectural walkthroughs
2. **Fly-through animation** — Presentation camera paths
3. **Rule-based model checking** — Automated compliance validation
4. **IDS validation** — Information Delivery Specification checking
5. **Quantity takeoff + Excel export** — Cost estimation support
6. **Smart Views (property rules)** — Saved filter+color combinations
7. **Point cloud integration** — Scan-to-BIM workflows
8. **Point cloud vs. model comparison** — As-built vs. as-designed
9. **Augmented Reality** — On-site model overlay
10. **QR code integration** — Link physical locations to digital model
11. **Real-time shared sessions** — Multi-user live collaboration
12. **Follow mode** — See another user's viewpoint live
13. **Power BI integration** — Business intelligence dashboards
14. **Explode view** — Separate components spatially
15. **PBR materials / Advanced rendering** — Photorealistic visualization
16. **Double-precision coordinates** — GIS-scale accuracy
17. **Custom computed properties** — Derived attributes
18. **Checklists / Inspections** — Field workflow tools
19. **2D/3D drawing overlay** — Combined plan + model view

---

## Viewer Positioning Map

| Viewer | Strength | Weakness |
|--------|----------|----------|
| **xeokit** | Performance, SDK flexibility, open source, double-precision | No built-in collaboration platform, limited measurements |
| **Autodesk APS** | Format breadth (80+), rich extensions, ecosystem integration | Proprietary, requires cloud, subscription cost, no IFC-native |
| **BIMcollab ZOOM** | Smart Views, BCF workflow, clash detection, free viewer | Desktop only (Zoom), limited rendering |
| **Trimble Connect** | Full platform (CDE), AR, mobile, clash detection, 45+ formats | Platform lock-in, viewing features not best-in-class |
| **Solibri** | Model checking (70+ rules), ITO, deepest property inspection | Expensive, desktop-only, no web viewer (except Anywhere) |
| **BIM Vision** | Free, plugins, collision detection, change monitoring | Windows only, aging UI, limited collaboration |
| **That Open Engine** | Open source, IFC read/write, web-native, Fragments format | Early maturity, limited built-in tools, IFC only |
| **Speckle** | Open source, live sync, version history, broad connectors | Limited measurement, no clash detection, no BCF |
| **Dalux** | Mobile/field leader, AR, QR codes, offline, 1M+ models | Limited analysis tools, no model checking |
| **Catenda Hub** | openBIM standards, BCF server, cloud CDE, 5 tree views | Limited advanced visualization, no desktop client |

---

## Sources

- [xeokit SDK](https://xeokit.io/)
- [xeokit GitHub](https://github.com/xeokit/xeokit-sdk)
- [xeokit BIM Viewer](https://xeokit.github.io/xeokit-bim-viewer/)
- [Autodesk Viewer SDK](https://aps.autodesk.com/viewer-sdk)
- [Autodesk APS Features](https://autodeskviewer.com/viewers/latest/docs/tutorial-features.html)
- [BIMcollab Features Overview](https://helpcenter.bimcollab.com/en/articles/325081-bimcollab-features-overview)
- [BIMcollab ZOOM](https://www.bimcollab.com/en/products/bimcollab-zoom/)
- [Trimble Connect](https://www.trimble.com/en/products/trimble-connect)
- [Trimble Connect Measurement Tools](https://docs.windows.connect.trimble.com/measuring/measurement-tools)
- [Solibri Offerings](https://www.solibri.com/our-offerings)
- [Solibri Information Takeoff](https://help.solibri.com/hc/en-us/articles/1500004203942)
- [Solibri Model Tree](https://help.solibri.com/hc/en-us/articles/1500003935741)
- [BIMvision](https://bimvision.eu/)
- [That Open Engine](https://docs.thatopen.com/)
- [That Open Components (GitHub)](https://github.com/ThatOpen/engine_components)
- [Speckle](https://speckle.systems/)
- [Speckle Docs](https://docs.speckle.systems/)
- [Speckle Redesigned Viewer](https://speckle.systems/updates/redesigned-3d-web-viewer/)
- [Dalux BIM Viewer](https://www.dalux.com/products/bim-viewer/)
- [Dalux 2D/3D Functionality](https://www.dalux.com/solutions/2d-and-3d-viewer-functionality/)
- [Catenda Hub](https://catenda.com/bim-solutions-open-standards/catenda-hub-common-data-environment/)
- [Catenda Trees Panel](https://support.catenda.com/en/articles/4670290-trees-panel)
- [Catenda QTO](https://support.catenda.com/en/articles/6673929-quantity-take-off-qto)
- [APS vs IFC.js Comparison (ioLabs)](https://iolabs.ch/en/blog/comparing-viewers/)
- [BCF Standard (buildingSMART)](https://technical.buildingsmart.org/standards/bcf/)
