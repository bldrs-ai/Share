/*
 * Pro-module ENTRY for the GLB export.
 *
 * Built as its own esbuild bundle into `netlify/functions/_pro-modules/`
 * (tools/esbuild/proModules.js) and served, only to a verified subscriber, by
 * `netlify/functions/pro-module.js`. It is never part of `docs/`, so nothing
 * in the host bundle may import it — an eslint fence enforces that, and this
 * file's own import of the implementation is the one permitted edge.
 *
 * Deliberately a thin re-export: the entry is the module's PUBLIC contract
 * (`format` + `exportArtifact`, what `useExport.js` calls on the imported
 * namespace), while `glbExport.js` stays an ordinary unit-testable module.
 *
 * Design: design/new/glb-export-premium.md §4.1, §4.3.
 */

export {exportArtifact, format} from './glbExport'
