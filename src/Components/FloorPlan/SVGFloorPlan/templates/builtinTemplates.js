/**
 * Built-in floor plan templates.
 *
 * Each template defines page layout, title block, and styling
 * for SVG export.
 */

export const TEMPLATES = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    pageSize: null, // no fixed page — fits content
    orientation: 'landscape',
    margins: {top: 2, right: 2, bottom: 2, left: 2},
    titleBlock: null,
    logo: null,
    border: {show: false, strokeWidth: 0, margin: 0},
    defaultScale: 100,
  },

  'a4-landscape': {
    id: 'a4-landscape',
    name: 'A4 Landscape',
    pageSize: {width: 297, height: 210}, // mm
    orientation: 'landscape',
    margins: {top: 10, right: 10, bottom: 10, left: 10},
    titleBlock: {
      position: 'bottom-right',
      width: 90,
      height: 30,
      fields: [
        {key: 'project', label: 'Project', position: {x: 3, y: 8}, fontSize: 3, fontWeight: '500'},
        {key: 'storey', label: 'Floor', position: {x: 3, y: 14}, fontSize: 2.5},
        {key: 'scale', label: 'Scale', position: {x: 3, y: 20}, fontSize: 2.5},
        {key: 'date', label: 'Date', position: {x: 3, y: 26}, fontSize: 2},
        {key: 'drawn_by', label: 'Drawn', position: {x: 50, y: 20}, fontSize: 2},
        {key: 'revision', label: 'Rev', position: {x: 50, y: 26}, fontSize: 2},
      ],
    },
    logo: null,
    border: {show: true, strokeWidth: 0.3, margin: 5},
    defaultScale: 100,
  },

  'a3-landscape': {
    id: 'a3-landscape',
    name: 'A3 Landscape',
    pageSize: {width: 420, height: 297},
    orientation: 'landscape',
    margins: {top: 10, right: 10, bottom: 10, left: 10},
    titleBlock: {
      position: 'bottom-right',
      width: 120,
      height: 35,
      fields: [
        {key: 'project', label: 'Project', position: {x: 3, y: 9}, fontSize: 4, fontWeight: '500'},
        {key: 'storey', label: 'Floor', position: {x: 3, y: 17}, fontSize: 3},
        {key: 'scale', label: 'Scale', position: {x: 3, y: 23}, fontSize: 3},
        {key: 'date', label: 'Date', position: {x: 3, y: 29}, fontSize: 2.5},
        {key: 'drawn_by', label: 'Drawn by', position: {x: 65, y: 23}, fontSize: 2.5},
        {key: 'checked_by', label: 'Checked by', position: {x: 65, y: 29}, fontSize: 2.5},
        {key: 'revision', label: 'Rev', position: {x: 100, y: 29}, fontSize: 2.5},
      ],
    },
    logo: null,
    border: {show: true, strokeWidth: 0.3, margin: 5},
    defaultScale: 100,
  },

  'a1-landscape': {
    id: 'a1-landscape',
    name: 'A1 Landscape',
    pageSize: {width: 841, height: 594},
    orientation: 'landscape',
    margins: {top: 15, right: 15, bottom: 15, left: 25}, // left wider for binding
    titleBlock: {
      position: 'bottom-right',
      width: 180,
      height: 45,
      fields: [
        {key: 'project', label: 'Project', position: {x: 5, y: 12}, fontSize: 6, fontWeight: '500'},
        {key: 'storey', label: 'Floor', position: {x: 5, y: 22}, fontSize: 4},
        {key: 'scale', label: 'Scale', position: {x: 5, y: 30}, fontSize: 4},
        {key: 'date', label: 'Date', position: {x: 5, y: 38}, fontSize: 3},
        {key: 'drawn_by', label: 'Drawn by', position: {x: 100, y: 30}, fontSize: 3},
        {key: 'checked_by', label: 'Checked by', position: {x: 100, y: 38}, fontSize: 3},
        {key: 'revision', label: 'Rev', position: {x: 150, y: 38}, fontSize: 3},
      ],
    },
    logo: null,
    border: {show: true, strokeWidth: 0.5, margin: 5},
    defaultScale: 50,
  },
}


/**
 * Get a template by ID. Falls back to minimal.
 *
 * @param {string} id
 * @return {object}
 */
export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES.minimal
}


/**
 * Get all available template IDs and names.
 *
 * @return {Array<{id: string, name: string}>}
 */
export function getAllTemplates() {
  return Object.values(TEMPLATES).map((t) => ({id: t.id, name: t.name}))
}
