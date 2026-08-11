/**
 * The model's own route, with any element selection stripped: selecting
 * an element appends numeric path segments to the model route
 * (`/share/v/p/index.ifc/81/621`, `…/Momentum.ifc/88/111/153/3768/199961`),
 * and any workspace surface that treats the raw pathname as model
 * identity would mint one phantom "model" per selected element — which
 * is exactly what the ProjectsDrawer's Ungrouped section did.
 *
 * Format-neutral on purpose (IFC expressID paths and STEP occurrence
 * paths are both numeric segments), and conservative: only trailing
 * all-numeric segments are stripped, so numeric-ish *file* segments
 * (`123.ifc`, OPFS uuids) survive.
 *
 * @param pathname e.g. location.pathname
 * @return The pathname minus any trailing element-path segments.
 */
export function modelPathFromPathname(pathname: string): string {
  return pathname.replace(/(\/\d+)+\/?$/, '')
}
