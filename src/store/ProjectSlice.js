import {getProjectRepository} from '../Infrastructure/ProjectData/ProjectRepository'
import {
  writeProjectFile,
  deleteProjectFile,
  deleteModelDirectory,
  computeFileHash,
} from '../Infrastructure/ProjectData/ProjectFileStore'
import {importSeedData} from '../Infrastructure/ProjectData/SeedManager'


const ACTIVE_COMPANY_KEY = 'bldrs-active-company'
const ACTIVE_PROJECT_KEY = 'bldrs-active-project'


/**
 * Zustand slice for Company/Project context.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createProjectSlice(set, get) {
  const repo = getProjectRepository()

  return {
    projectRepository: repo,

    // Active context
    activeCompanyId: null,
    activeProjectId: null,

    // Cached lists
    companies: [],
    projects: [],
    modelRefs: [],
    modelVersions: [],

    // Pending view state to restore after model loads
    pendingViewState: null,

    // Admin dialog
    isProjectAdminVisible: false,
    setIsProjectAdminVisible: (is) => set({isProjectAdminVisible: is}),

    // Actions
    loadCompanies: async () => {
      const companies = await repo.listCompanies()
      set({companies})
    },

    setActiveCompany: async (companyId) => {
      set({activeCompanyId: companyId, activeProjectId: null, projects: [], modelRefs: []})
      if (companyId) {
        const projects = await repo.listProjects(companyId)
        set({projects})
        localStorage.setItem(ACTIVE_COMPANY_KEY, companyId)
      } else {
        localStorage.removeItem(ACTIVE_COMPANY_KEY)
      }
      localStorage.removeItem(ACTIVE_PROJECT_KEY)
    },

    setActiveProject: async (projectId) => {
      set({activeProjectId: projectId, modelRefs: []})
      if (projectId) {
        const modelRefs = await repo.listModels(projectId)
        set({modelRefs})
        localStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
      } else {
        localStorage.removeItem(ACTIVE_PROJECT_KEY)
      }
    },

    // Model version actions
    loadModelVersions: async (modelId) => {
      const versions = await repo.listVersions(modelId)
      versions.sort((a, b) => b.versionNumber - a.versionNumber)
      set({modelVersions: versions})
    },

    addModelToProject: async (file) => {
      const projectId = get().activeProjectId
      if (!projectId) {
        console.warn('[ProjectSlice] No active project — cannot add model')
        return null
      }

      try {
        const modelId = crypto.randomUUID()
        const versionId = crypto.randomUUID()
        const hash = await computeFileHash(file)
        const opfsPath = await writeProjectFile(projectId, modelId, 1, file)

        const version = {
          id: versionId,
          modelId,
          versionNumber: 1,
          comment: 'Initial upload',
          fileHash: hash,
          fileSizeBytes: file.size,
          originalFileName: file.name,
          opfsPath,
          createdAt: new Date().toISOString(),
        }
        await repo.saveVersion(version)

        const modelRef = {
          id: modelId,
          projectId,
          name: file.name,
          currentVersionId: versionId,
          source: 'local',
          addedAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
        }
        await repo.saveModel(modelRef)

        const modelRefs = await repo.listModels(projectId)
        set({modelRefs})
        return modelRef
      } catch (err) {
        console.error('[ProjectSlice] Failed to add model:', err)
        return null
      }
    },

    addModelVersion: async (modelId, file, comment) => {
      const projectId = get().activeProjectId
      if (!projectId) return null

      const existing = await repo.listVersions(modelId)
      const maxVersion = existing.reduce((max, v) => Math.max(max, v.versionNumber), 0)
      const nextVersion = maxVersion + 1

      const versionId = crypto.randomUUID()
      const hash = await computeFileHash(file)
      const opfsPath = await writeProjectFile(projectId, modelId, nextVersion, file)

      const version = {
        id: versionId,
        modelId,
        versionNumber: nextVersion,
        comment: comment || `Version ${nextVersion}`,
        fileHash: hash,
        fileSizeBytes: file.size,
        originalFileName: file.name,
        opfsPath,
        createdAt: new Date().toISOString(),
      }
      await repo.saveVersion(version)

      // Update model's current version
      const model = await repo.getModel(modelId)
      if (model) {
        model.currentVersionId = versionId
        await repo.saveModel(model)
      }

      const versions = await repo.listVersions(modelId)
      versions.sort((a, b) => b.versionNumber - a.versionNumber)
      const modelRefs = await repo.listModels(projectId)
      set({modelVersions: versions, modelRefs})
      return version
    },

    deleteModelFromProject: async (modelId) => {
      const projectId = get().activeProjectId
      if (!projectId) return

      // Delete OPFS files
      await deleteModelDirectory(projectId, modelId)
      // Cascade delete in IndexedDB (model + versions)
      await repo.deleteModel(modelId)

      const modelRefs = await repo.listModels(projectId)
      set({modelRefs, modelVersions: []})
    },

    deleteModelVersion: async (versionId) => {
      const projectId = get().activeProjectId
      if (!projectId) return

      const version = await repo.getVersion(versionId)
      if (!version) return

      // Delete OPFS file
      await deleteProjectFile(version.opfsPath)
      await repo.deleteVersion(versionId)

      // If this was the current version, update ModelRef to latest remaining
      const model = await repo.getModel(version.modelId)
      if (model && model.currentVersionId === versionId) {
        const remaining = await repo.listVersions(version.modelId)
        if (remaining.length > 0) {
          remaining.sort((a, b) => b.versionNumber - a.versionNumber)
          model.currentVersionId = remaining[0].id
        } else {
          model.currentVersionId = null
        }
        await repo.saveModel(model)
      }

      const versions = await repo.listVersions(version.modelId)
      versions.sort((a, b) => b.versionNumber - a.versionNumber)
      const modelRefs = await repo.listModels(projectId)
      set({modelVersions: versions, modelRefs})
    },

    saveModelViewState: async (viewState) => {
      const projectId = get().activeProjectId
      if (!projectId) return

      const modelRefs = get().modelRefs
      if (modelRefs.length === 0) return

      // Save to the most recently opened model
      const sorted = [...modelRefs].sort((a, b) =>
        new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
      )
      const model = sorted[0]
      model.viewState = viewState
      await repo.saveModel(model)

      const updatedRefs = await repo.listModels(projectId)
      set({modelRefs: updatedRefs})
    },

    restoreProjectContext: async () => {
      // Import seed data from server if available (first run on GH Pages)
      await importSeedData(repo)

      const companies = await repo.listCompanies()
      set({companies})

      const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY)
      if (companyId) {
        const projects = await repo.listProjects(companyId)
        set({activeCompanyId: companyId, projects})

        const projectId = localStorage.getItem(ACTIVE_PROJECT_KEY)
        if (projectId) {
          const modelRefs = await repo.listModels(projectId)
          set({activeProjectId: projectId, modelRefs})

}
      }
    },
  }
}
