const WORKSPACE_PROJECTS_KEY = 'bldrs:workspace-projects'
const WORKSPACE_PROJECTS_VERSION = 1


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
