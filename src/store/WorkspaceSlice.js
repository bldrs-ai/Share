import {
  loadWorkspaceCapture,
  loadWorkspaceProjects,
  newWorkspaceId,
  saveWorkspaceCapture,
  saveWorkspaceProjects,
} from '../workspace/persistence'


/**
 * Zustand slice for the workspace shell (`?feature=workspace` — epic
 * assist-300, #1657): projects → models shown in the ProjectsDrawer.
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
  const persist = (projects) => {
    saveWorkspaceProjects(projects)
    return {workspaceProjects: projects}
  }

  return {
    workspaceProjects: loadWorkspaceProjects(),

    createWorkspaceProject: (name) =>
      set((state) => persist([
        ...state.workspaceProjects,
        {id: newWorkspaceId(), name: name, models: []},
      ])),

    removeWorkspaceProject: (projectId) =>
      set((state) => persist(
        state.workspaceProjects.filter((p) => p.id !== projectId),
      )),

    // Dedup by path within the project: re-adding an already-listed model
    // refreshes its label instead of creating a second row.
    addWorkspaceModel: (projectId, {label, path}) =>
      set((state) => persist(state.workspaceProjects.map((p) => {
        if (p.id !== projectId) {
          return p
        }
        const existing = p.models.find((m) => m.path === path)
        const models = existing ?
          p.models.map((m) => m.path === path ? {...m, label: label} : m) :
          [...p.models, {id: newWorkspaceId(), label: label, path: path}]
        return {...p, models: models}
      }))),

    removeWorkspaceModel: (projectId, modelId) =>
      set((state) => persist(state.workspaceProjects.map((p) =>
        p.id === projectId ?
          {...p, models: p.models.filter((m) => m.id !== modelId)} :
          p,
      ))),

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
