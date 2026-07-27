const WORKSPACE_PROJECTS_KEY = 'bldrs:workspace-projects'
const WORKSPACE_PROJECTS_VERSION = 1
const WORKSPACE_CAPTURE_KEY = 'bldrs:workspace-capture'
const WORKSPACE_UI_KEY = 'bldrs:workspace-ui'
const MS_PER_MINUTE = 60_000
/** Armed captures expire after this long — see loadWorkspaceCapture */
const CAPTURE_TTL_MINUTES = 10
const CAPTURE_TTL_MS = CAPTURE_TTL_MINUTES * MS_PER_MINUTE


/** A model reference inside a project — path is the in-app navigate path */
export interface WorkspaceModelRef {
  id: string
  /** Display label, usually the model filename */
  label: string
  /** In-app navigate path, e.g. /share/v/gh/owner/repo/main/file.ifc */
  path: string
}


export interface WorkspaceProject {
  id: string
  name: string
  models: WorkspaceModelRef[]
}


interface WorkspaceProjectsStore {
  version: number
  projects: WorkspaceProject[]
}


/**
 * Load persisted workspace projects. Tier-1 persistence per
 * design/new/conversational-cad.md §2.2: localStorage only, the same
 * durability class as recents. A version mismatch drops the store rather
 * than migrating — acceptable while the flag is off by default.
 *
 * @return Parsed projects array, empty on absence/corruption.
 */
export function loadWorkspaceProjects(): WorkspaceProject[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_PROJECTS_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as WorkspaceProjectsStore
    if (parsed.version !== WORKSPACE_PROJECTS_VERSION || !Array.isArray(parsed.projects)) {
      return []
    }
    return parsed.projects
  } catch {
    return []
  }
}


/** @param projects The projects to persist */
export function saveWorkspaceProjects(projects: WorkspaceProject[]): void {
  try {
    localStorage.setItem(
      WORKSPACE_PROJECTS_KEY,
      JSON.stringify({version: WORKSPACE_PROJECTS_VERSION, projects: projects}),
    )
  } catch {
    // localStorage may be full or unavailable
  }
}


/**
 * An armed "record the next model I open into this project" intent.
 * `armedPathname` is the location at arm time, so a dialog dismissed
 * without navigating can be told apart from one that navigated.
 */
export interface WorkspaceCapture {
  projectId: string
  armedPathname: string
  armedAtMs: number
}


/**
 * Load the armed capture, if any. This has to survive a full page load:
 * opening a model calls `navigateToModel`, which reloads the document
 * (freeing viewer memory), so in-memory state is gone by the time the
 * opened model's route renders.
 *
 * A capture older than CAPTURE_TTL_MS is dropped — otherwise an "Add
 * model" abandoned days ago would silently adopt an unrelated model the
 * next time one is opened.
 *
 * @return The armed capture, or null when absent/expired/corrupt.
 */
export function loadWorkspaceCapture(): WorkspaceCapture | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_CAPTURE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as WorkspaceCapture
    if (typeof parsed?.projectId !== 'string' || typeof parsed?.armedAtMs !== 'number') {
      return null
    }
    if (Date.now() - parsed.armedAtMs > CAPTURE_TTL_MS) {
      localStorage.removeItem(WORKSPACE_CAPTURE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}


/** @param capture The capture to persist, or null to clear */
export function saveWorkspaceCapture(capture: WorkspaceCapture | null): void {
  try {
    if (capture === null) {
      localStorage.removeItem(WORKSPACE_CAPTURE_KEY)
      return
    }
    localStorage.setItem(WORKSPACE_CAPTURE_KEY, JSON.stringify(capture))
  } catch {
    // localStorage may be full or unavailable
  }
}


/** Drawer/tree UI state that should outlive a reload */
export interface WorkspaceUiState {
  /** Projects whose model list is expanded */
  expandedProjectIds: string[]
  isDrawerCollapsed: boolean
}


const DEFAULT_UI_STATE: WorkspaceUiState = {
  expandedProjectIds: [],
  isDrawerCollapsed: false,
}


/**
 * Load persisted drawer UI state. Toggling a project open or collapsing
 * the drawer is a preference, not a transient — re-doing it after every
 * reload is the kind of small friction that makes a shell feel cheap.
 * Width is deliberately not persisted: it changes at drag frequency.
 *
 * @return Stored UI state, defaults on absence/corruption.
 */
export function loadWorkspaceUiState(): WorkspaceUiState {
  try {
    const raw = localStorage.getItem(WORKSPACE_UI_KEY)
    if (!raw) {
      return {...DEFAULT_UI_STATE}
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>
    return {
      expandedProjectIds: Array.isArray(parsed.expandedProjectIds) ? parsed.expandedProjectIds : [],
      isDrawerCollapsed: parsed.isDrawerCollapsed === true,
    }
  } catch {
    return {...DEFAULT_UI_STATE}
  }
}


/** @param uiState The UI state to persist */
export function saveWorkspaceUiState(uiState: WorkspaceUiState): void {
  try {
    localStorage.setItem(WORKSPACE_UI_KEY, JSON.stringify(uiState))
  } catch {
    // localStorage may be full or unavailable
  }
}


/**
 * @return A collision-safe id for projects and model refs.
 */
export function newWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const base = 36
  const idLen = 10
  return `ws-${Date.now().toString(base)}-${Math.random().toString(base).slice(2, idLen)}`
}
