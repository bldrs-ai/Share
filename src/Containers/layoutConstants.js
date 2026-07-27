/**
 * Cross-container layout constants.
 *
 * These are shared because separate containers have to agree on them:
 * the ProjectsDrawer sits directly against the control groups and the
 * top bar, so its rows have to land on the same vertical grid or the
 * mismatch reads as sloppiness at the seam.
 *
 * The grid comes from `StandardButton` in theme/Components.js, which
 * every control icon uses: a 3em (48px at the default 1rem) square with
 * a 5px margin, so one control row occupies 58px. Mirrored here as
 * numbers because layout maths (and tests) need them; keep in sync if
 * StandardButton changes.
 */


/** StandardButton width/height — the control-icon square */
export const CONTROL_SIZE = 48


/** StandardButton margin, on every side */
export const CONTROL_MARGIN = 5


/**
 * Vertical pitch of one control row: the icon plus its margins. Drawer
 * rows, the collapsed rail's project icons and the control groups all
 * step on this.
 */
export const ROW_PITCH = CONTROL_SIZE + (2 * CONTROL_MARGIN)


/**
 * Height of the top bar over the canvas, and of the drawer header row —
 * exactly one control row, so the two columns start together.
 */
export const TOP_BAR_HEIGHT = ROW_PITCH
