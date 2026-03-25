# Spec: Floor Plan Document Management

```yaml
id: share-spec-003
status: approved
author: solution-architect
created: 2026-03-22
tracks:
depends-on: [share-spec-001, share-spec-002]
```

---

## 1. Problem

The SVG floor plan is currently ephemeral — measurements and annotations disappear when switching floors or reloading. Users need to:
- Save named versions of floor plans with their measurements and annotations
- Apply templates with company headers, logos, and title block layouts
- Manage multiple documents per model (e.g., "Ground Floor - Measurements", "Ground Floor - Area Analysis")
- Persist locally now, sync to GitHub later

## 2. Solution

A **Floor Plan Document** system with three layers:

1. **Templates** — Reusable page layouts (title block, header, logo, border, scale position)
2. **Documents** — Named, versioned floor plan files containing geometry + measurements + annotations + template reference
3. **Storage** — Local persistence (IndexedDB/localStorage) with future GitHub sync

## 3. Design

### 3.1 Data Model

```typescript
// A template defines the page layout and branding
interface FloorPlanTemplate {
  id: string
  name: string                      // "Company Standard A3"
  pageSize: { width: number, height: number }  // mm (A4=210x297, A3=297x420)
  orientation: 'landscape' | 'portrait'
  margins: { top: number, right: number, bottom: number, left: number }  // mm
  titleBlock: {
    position: 'bottom-right' | 'bottom-full' | 'right-strip'
    width: number                   // mm
    height: number                  // mm
    fields: TitleBlockField[]
  }
  logo?: {
    svgContent: string              // inline SVG or data URL
    position: { x: number, y: number }  // mm from top-left
    size: { width: number, height: number }  // mm
  }
  border: {
    show: boolean
    strokeWidth: number             // mm
    margin: number                  // mm from page edge
  }
  defaultScale: number              // e.g., 100 for 1:100
}

interface TitleBlockField {
  key: string                       // 'project', 'storey', 'date', 'scale', 'drawn_by', 'checked_by', 'revision'
  label: string
  value?: string                    // default value (overridable per document)
  position: { x: number, y: number }  // relative to title block origin
  fontSize: number                  // mm
  fontWeight?: string
}

// A document is a saved floor plan with all its data
interface FloorPlanDocument {
  id: string                        // UUID
  name: string                      // user-defined name
  modelId: string                   // identifies the IFC model (hash or filename)
  storeyName: string
  storeyElevation: number
  templateId: string                // reference to template
  scale: number
  viewBox: { x: number, y: number, width: number, height: number }
  measurements: Measurement[]       // distance + area measurements
  annotations: Annotation[]
  titleBlockValues: Record<string, string>  // override template defaults
  createdAt: string                 // ISO date
  updatedAt: string
  version: number                   // auto-incremented on save
}
```

### 3.2 Template System

**Built-in templates:**
- `minimal` — No border, small scale bar and storey name only (current behavior)
- `a4-landscape` — A4 landscape with border, bottom-right title block
- `a3-landscape` — A3 landscape with border, right-strip title block
- `a1-landscape` — A1 landscape for large prints

**Custom templates:**
- Users can duplicate a built-in template and modify it
- Logo uploaded as SVG/PNG (stored as data URL)
- Title block fields are configurable

**Template storage:**
- Built-in templates: shipped as JS constants
- Custom templates: saved in localStorage alongside documents

### 3.3 Document Lifecycle

```
[New]  →  User enters floor plan mode, selects a floor
          → Auto-creates an unsaved document with "minimal" template
[Edit] →  User adds measurements, annotations, changes scale
          → Auto-saved continuously to IndexedDB (debounced)
[Name] →  User names the document (required on first auto-save)
[Open] →  User browses saved documents → selects one → restores all state
[New Version] → User explicitly clicks "New Version" → version number increments,
                current state is snapshotted
[Export] → Renders the document with its template to a downloadable SVG
```

### 3.4 Storage (Phase 1: Local)

**IndexedDB** via a simple key-value wrapper:
- Store: `floorplan-documents` — all saved documents
- Store: `floorplan-templates` — custom templates
- Key: document/template `id`
- Index on `modelId` for fast lookup per model

**localStorage fallback** if IndexedDB unavailable.

### 3.5 Storage (Phase 2: GitHub — future)

- Save SVG files to a GitHub repository
- Path: `floorplans/{model-name}/{document-name}.svg`
- Also save the document JSON as `{document-name}.json` for re-editing
- Use GitHub API via `gh` or OAuth token
- Version history via git commits

### 3.6 SVG Export with Template

The exported SVG wraps the floor plan geometry inside the template layout:

```svg
<svg width="420mm" height="297mm" viewBox="0 0 420 297">
  <!-- Border -->
  <rect x="5" y="5" width="410" height="287" fill="none" stroke="#000" stroke-width="0.3"/>

  <!-- Drawing area (floor plan geometry, scaled to fit) -->
  <g transform="translate(15, 15) scale(0.01)">
    <!-- ... wall polygons, measurements, etc. ... -->
  </g>

  <!-- Title block -->
  <g transform="translate(320, 260)">
    <rect width="95" height="32" fill="none" stroke="#000" stroke-width="0.2"/>
    <text x="5" y="8" font-size="3">PROJECT: Two Storey House</text>
    <text x="5" y="14" font-size="3">FLOOR: Ground Floor</text>
    <text x="5" y="20" font-size="2.5">SCALE: 1:100</text>
    <text x="5" y="26" font-size="2.5">DATE: 2026-03-22</text>
    <text x="60" y="26" font-size="2">REV: 1</text>
  </g>

  <!-- Logo -->
  <image x="325" y="262" width="20" height="8" href="data:image/svg+xml;base64,..."/>
</svg>
```

### 3.7 UI

**Document bar** (below the toolbar in SVG panel):
```
[📄 Document Name ▾] [New Version] [📁 Open] [+ New] | Template: [Minimal ▾] | Scale: [1:100 ▾] | ✓ Saved
```

- Document name: editable inline, click to rename
- New Version: snapshots current state with incremented version number
- Open: shows list of saved documents for this model
- New: creates a fresh document for current floor
- Template dropdown: switch template
- Scale dropdown: 1:50, 1:100, 1:200
- Auto-save indicator: shows "Saving..." / "✓ Saved"

**Open dialog:**
```
┌─ Saved Floor Plans ──────────────────┐
│ Ground Floor - Measurements    v3  📤│
│ Ground Floor - Area Analysis   v1  📤│
│ First Floor - Review           v2  📤│
│                                      │
│ [Delete Selected]                    │
└──────────────────────────────────────┘
```

### 3.8 File Structure

```
Share/src/
  Components/FloorPlan/SVGFloorPlan/
    templates/
      types.js                  # Template and Document interfaces
      builtinTemplates.js       # minimal, a4, a3, a1 templates
      TemplateRenderer.js       # Wraps floor plan in template SVG
    storage/
      DocumentStore.js          # IndexedDB/localStorage persistence
      DocumentStore.test.js
    DocumentBar.jsx             # Save/Open/Template/Scale controls
    DocumentBar.test.jsx
```

## 4. Acceptance Criteria

1. GIVEN a floor plan with measurements WHEN the user clicks Save and enters a name THEN the document is persisted to localStorage and can be reopened
2. GIVEN a saved document WHEN the user clicks Open and selects it THEN all measurements, annotations, and view state are restored
3. GIVEN a document WHEN the user selects a different template THEN the export renders with that template's layout, title block, and border
4. GIVEN the A4 template WHEN the user exports SVG THEN the output has correct A4 dimensions with border and title block
5. GIVEN multiple saved documents for a model WHEN the user opens the document list THEN all documents are shown with name, version, and date
6. GIVEN a document WHEN the user clicks New Version THEN the version number increments and the current state is snapshotted
7. GIVEN the user switches floors WHEN they return to a floor with saved documents THEN the document selector shows available documents
8. GIVEN the user adds a measurement THEN the document is auto-saved within 2 seconds

## 5. Out of Scope

- GitHub sync (Phase 2)
- PDF export
- Template visual editor (WYSIWYG)
- Multi-user collaboration on documents
- Undo/redo history beyond measurements

## 6. Open Questions

*All resolved — sponsor decisions:*
- Auto-save continuously (debounced) — no explicit Save button needed
- New versions created only on explicit user request — changes don't auto-create versions
- Template sharing not needed for now
