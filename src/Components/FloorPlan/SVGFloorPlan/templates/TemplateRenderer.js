/**
 * Wraps floor plan SVG content inside a template page layout
 * with border, title block, and logo.
 */

import {getTemplate} from './builtinTemplates'


/**
 * Render a complete page SVG with template applied.
 *
 * @param {string} floorPlanSvgContent - the inner SVG (geometry + measurements)
 * @param {string} templateId
 * @param {object} titleValues - {project, storey, scale, date, drawn_by, ...}
 * @return {string} complete SVG page
 */
export function renderWithTemplate(floorPlanSvgContent, templateId, titleValues = {}) {
  const tpl = getTemplate(templateId)

  // Minimal template: just return the floor plan as-is
  if (!tpl.pageSize) {
    return floorPlanSvgContent
  }

  const {width: pw, height: ph} = tpl.pageSize
  const m = tpl.margins
  const drawW = pw - m.left - m.right
  const drawH = ph - m.top - m.bottom - (tpl.titleBlock ? tpl.titleBlock.height + 2 : 0)

  const lines = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}" style="background: #ffffff">`)
  lines.push(`  <!-- Template: ${esc(tpl.name)} -->`)
  lines.push(`  <!-- Generated: ${new Date().toISOString()} -->`)

  // Border
  if (tpl.border.show) {
    const bm = tpl.border.margin
    lines.push(`  <rect x="${bm}" y="${bm}" width="${pw - bm * 2}" height="${ph - bm * 2}" fill="none" stroke="#000" stroke-width="${tpl.border.strokeWidth}"/>`)
  }

  // Drawing area — extract viewBox from floor plan SVG and scale to fit
  const innerViewBox = extractViewBox(floorPlanSvgContent)
  if (innerViewBox) {
    const scaleX = drawW / innerViewBox.width
    const scaleY = drawH / innerViewBox.height
    const scale = Math.min(scaleX, scaleY) * 0.95 // 5% padding

    const offsetX = m.left + (drawW - innerViewBox.width * scale) / 2
    const offsetY = m.top + (drawH - innerViewBox.height * scale) / 2

    lines.push(`  <g transform="translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${scale.toFixed(6)}) translate(${(-innerViewBox.x).toFixed(2)}, ${(-innerViewBox.y).toFixed(2)})">`)
    // Insert inner SVG content (strip outer <svg> and </svg> tags)
    const inner = floorPlanSvgContent
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
    lines.push(inner)
    lines.push(`  </g>`)
  }

  // Title block
  if (tpl.titleBlock) {
    const tb = tpl.titleBlock
    const tbX = pw - m.right - tb.width
    const tbY = ph - m.bottom - tb.height

    lines.push(`  <g class="title-block" transform="translate(${tbX}, ${tbY})">`)
    lines.push(`    <rect width="${tb.width}" height="${tb.height}" fill="none" stroke="#000" stroke-width="0.2"/>`)

    // Horizontal line separating title from fields
    lines.push(`    <line x1="0" y1="${tb.height * 0.35}" x2="${tb.width}" y2="${tb.height * 0.35}" stroke="#000" stroke-width="0.1"/>`)

    for (const field of tb.fields) {
      const value = titleValues[field.key] || ''
      const label = field.label
      const fw = field.fontWeight || 'normal'
      lines.push(`    <text x="${field.position.x}" y="${field.position.y}" font-family="Helvetica, Arial, sans-serif" font-size="${field.fontSize}" fill="#000" font-weight="${fw}">${esc(label)}: ${esc(value)}</text>`)
    }

    lines.push(`  </g>`)
  }

  // Logo
  if (tpl.logo && tpl.logo.svgContent) {
    const {position: lp, size: ls} = tpl.logo
    lines.push(`  <image x="${lp.x}" y="${lp.y}" width="${ls.width}" height="${ls.height}" href="${tpl.logo.svgContent}"/>`)
  }

  lines.push(`</svg>`)
  return lines.join('\n')
}


function extractViewBox(svgContent) {
  const match = svgContent.match(/viewBox="([^"]*)"/)
  if (!match) return null
  const parts = match[1].split(/\s+/).map(Number)
  if (parts.length !== 4) return null
  return {x: parts[0], y: parts[1], width: parts[2], height: parts[3]}
}


function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
