# Session Log

## 2026-03-22 — Builds 039-059

Extended session covering major UI improvements and feature additions:

**UI (builds 039-058):**
- TopBar with build version, app icons (Lucide), profile/help
- ViewerToolbar: floating pill bar with fit/reset/light/wireframe/projection
- LeftToolbar: expandable (40→160px) with all tools consolidated
- Apps drawer defaults to 50% width, viewer canvas resizes with ResizeObserver
- NavCube initial implementation
- Section plane grid-pattern gizmo (CutPlaneGizmo)
- LightManager with directional light + shadows
- Terrain overlay control (TerrainSlice)

**NavSphere rewrite (build 059):**
- Dark background disc for visibility against models
- Brighter wireframe (opacity 0.3) and axis rings (0.4)
- Drag-to-orbit: mousedown+drag rotates main camera
- Clickable axis dots (Front/Back/Left/Right/Top/Bottom)
- Bottom center positioning with transition for apps drawer

**Dashboard App:**
- Swiss real estate engine: eBKP cost estimation, SIA 416 area calculations
- Investment analysis (yield, cap rate, payback)
- Tabbed UI: Cost Estimate, Areas, Investment, Model Analysis
- Editable assumptions panel with live recalculation
- Built widget into Share's public/widgets/

**Commits pushed:**
- Share: `1b29e252` → `origin/main` (MarkusSteinbrecher/share)
- Dashboard: `fd271e5` → `origin/main` (MarkusSteinbrecher/dashboard-app)

**Deferred:**
- Theme/style selection page
- More Architect agent building models
- Section plane stencil caps + TransformControls
- VS Code flex layout (abandoned — Three.js incompatible)
