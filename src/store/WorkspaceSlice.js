import {
  loadWorkspaceCapture,
  loadWorkspaceContents,
  loadWorkspaceUiState,
  newWorkspaceId,
  saveWorkspaceCapture,
  saveWorkspaceContents,
  saveWorkspaceUiState,
} from '../workspace/persistence'


/** Starting width of the ProjectsDrawer, in px */
export const WORKSPACE_DRAWER_WIDTH_INITIAL = 240


/**
 * Zustand slice for the workspace shell (`?feature=workspace` — epic
 * assist-300, #1657): projects → models shown in the ProjectsDrawer,
 * plus the models the user has open but hasn't filed anywhere.
 *
 * Every mutation writes through to localStorage (Tier-1 persistence,
 * design/new/conversational-cad.md §2.2), so the slice hydrates from
 * storage at store creation and stays the single in-memory copy.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createWorkspaceSlice(set, get) {
  // Projects and ungrouped models share one stored document, so a write
  // to either has to carry the other through.
  const persist = (state, next) => {
    const contents = {
      projects: next.projects ?? state.workspaceProjects,
      ungrouped: next.ungrouped ?? state.ungroupedModels,
    }
    saveWorkspaceContents(contents)
    return {workspaceProjects: contents.projects, ungroupedModels: contents.ungrouped}
  }

  // Both toggles persist together; they're the drawer's UI preferences.
  // Maps the stored shape onto the store's field names.
  const persistUi = (uiState) => {
    saveWorkspaceUiState(uiState)
    return {
      expandedProjectIds: uiState.expandedProjectIds,
      isWorkspaceDrawerCollapsed: uiState.isDrawerCollapsed,
    }
  }

  const initialContents = loadWorkspaceContents()
  const initialUi = loadWorkspaceUiState()

  return {
    // Width is in-memory only — it changes at drag frequency, and the
    // other drawers don't persist theirs either.
    workspaceDrawerWidth: WORKSPACE_DRAWER_WIDTH_INITIAL,
    setWorkspaceDrawerWidth: (width) => set(() => ({workspaceDrawerWidth: width})),

    isWorkspaceDrawerCollapsed: initialUi.isDrawerCollapsed,
    setIsWorkspaceDrawerCollapsed: (is) =>
      set((state) => persistUi({
        expandedProjectIds: state.expandedProjectIds,
        isDrawerCollapsed: is,
      })),

    expandedProjectIds: initialUi.expandedProjectIds,
    toggleWorkspaceProjectExpanded: (projectId) =>
      set((state) => persistUi({
        expandedProjectIds: state.expandedProjectIds.includes(projectId) ?
          state.expandedProjectIds.filter((id) => id !== projectId) :
          [...state.expandedProjectIds, projectId],
        isDrawerCollapsed: state.isWorkspaceDrawerCollapsed,
      })),

    workspaceProjects: initialContents.projects,

    // A just-created project is empty, and the only useful next action —
    // Add model — lives inside it, so it opens expanded.
    createWorkspaceProject: (name) =>
      set((state) => {
        const project = {id: newWorkspaceId(), name: name, models: []}
        return {
          ...persist(state, {projects: [...state.workspaceProjects, project]}),
          ...persistUi({
            expandedProjectIds: [...state.expandedProjectIds, project.id],
            isDrawerCollapsed: state.isWorkspaceDrawerCollapsed,
          }),
        }
      }),

    removeWorkspaceProject: (projectId) =>
      set((state) => persist(state, {
        projects: state.workspaceProjects.filter((p) => p.id !== projectId),
      })),

    // Dedup by path within the project: re-adding an already-listed model
    // refreshes its label instead of creating a second row.
    addWorkspaceModel: (projectId, {label, path}) =>
      set((state) => persist(state, {
        projects: state.workspaceProjects.map((p) => {
          if (p.id !== projectId) {
            return p
          }
          const existing = p.models.find((m) => m.path === path)
          const models = existing ?
            p.models.map((m) => m.path === path ? {...m, label: label} : m) :
            [...p.models, {id: newWorkspaceId(), label: label, path: path}]
          return {...p, models: models}
        }),
        // Filing a model under a project settles it.
        ungrouped: state.ungroupedModels.filter((m) => m.path !== path),
      })),

    removeWorkspaceModel: (projectId, modelId) =>
      set((state) => persist(state, {
        projects: state.workspaceProjects.map((p) =>
          p.id === projectId ?
            {...p, models: p.models.filter((m) => m.id !== modelId)} :
            p,
        ),
      })),

    // Models opened outside the drawer — a shared permalink, say — so
    // they're reachable and can be filed later rather than being lost.
    ungroupedModels: initialContents.ungrouped,

    addUngroupedModel: ({label, path}) =>
      set((state) => {
        const isInProject = state.workspaceProjects.some(
          (p) => p.models.some((m) => m.path === path))
        const existing = state.ungroupedModels.find((m) => m.path === path)
        if (isInProject) {
          return {}
        }
        return persist(state, {
          ungrouped: existing ?
            state.ungroupedModels.map((m) => m.path === path ? {...m, label: label} : m) :
            [...state.ungroupedModels, {id: newWorkspaceId(), label: label, path: path}],
        })
      }),

    removeUngroupedModel: (modelId) =>
      set((state) => persist(state, {
        ungrouped: state.ungroupedModels.filter((m) => m.id !== modelId),
      })),

    moveUngroupedModelToProject: (modelId, projectId) =>
      set((state) => {
        const model = state.ungroupedModels.find((m) => m.id === modelId)
        if (model === undefined) {
          return {}
        }
        return persist(state, {
          projects: state.workspaceProjects.map((p) => {
            if (p.id !== projectId || p.models.some((m) => m.path === model.path)) {
              return p
            }
            return {...p, models: [...p.models, model]}
          }),
          ungrouped: state.ungroupedModels.filter((m) => m.id !== modelId),
        })
      }),

    // Armed by the drawer's "Add model" before it opens the Open dialog:
    // the next navigation to a model route is recorded into projectId.
    // Persisted, because opening a model reloads the document
    // (navigateToModel) — in-memory state would be gone by the time the
    // opened model renders. See ProjectsDrawer's capture effects.
    workspaceCapture: loadWorkspaceCapture(),
    armWorkspaceCapture: (projectId, armedPathname) =>
      set(() => {
        const capture = {
          projectId: projectId,
          armedPathname: armedPathname,
          armedAtMs: Date.now(),
        }
        saveWorkspaceCapture(capture)
        return {workspaceCapture: capture}
      }),
    disarmWorkspaceCapture: () =>
      set(() => {
        saveWorkspaceCapture(null)
        return {workspaceCapture: null}
      }),
  }
}
