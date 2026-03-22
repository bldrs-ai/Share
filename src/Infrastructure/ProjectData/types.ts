// ── Core Entities ──

export interface Company {
  id: string
  name: string
  description: string
  logoDataUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  companyId: string
  name: string
  description: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export type ProjectStatus = 'active' | 'archived'

export interface ModelRef {
  id: string
  projectId: string
  name: string
  currentVersionId: string | null
  source: ModelSource
  addedAt: string
  lastOpenedAt: string
}

export type ModelSource = 'local' | 'github' | 'upload' | 'sample'

export interface ModelVersion {
  id: string
  modelId: string
  versionNumber: number
  comment: string
  fileHash: string | null
  fileSizeBytes: number
  originalFileName: string
  opfsPath: string
  createdAt: string
}

// ── App Data ──

export interface AppDataEnvelope<T = unknown> {
  projectId: string
  appId: string
  data: T
  updatedAt: string
  version: number
}

// ── Active Context ──

export interface ProjectContext {
  companyId: string | null
  projectId: string | null
  modelRefId: string | null
}

// ── Repository Interface ──

export interface ProjectRepository {
  // Companies
  listCompanies(): Promise<Company[]>
  getCompany(id: string): Promise<Company | null>
  saveCompany(company: Company): Promise<void>
  deleteCompany(id: string): Promise<void>

  // Projects
  listProjects(companyId: string): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>

  // Model references
  listModels(projectId: string): Promise<ModelRef[]>
  getModel(id: string): Promise<ModelRef | null>
  findModelByHash(fileHash: string): Promise<ModelRef | null>
  saveModel(model: ModelRef): Promise<void>
  deleteModel(id: string): Promise<void>

  // Model versions
  listVersions(modelId: string): Promise<ModelVersion[]>
  getVersion(id: string): Promise<ModelVersion | null>
  saveVersion(version: ModelVersion): Promise<void>
  deleteVersion(id: string): Promise<void>

  // App data
  getAppData<T>(projectId: string, appId: string): Promise<AppDataEnvelope<T> | null>
  saveAppData<T>(envelope: AppDataEnvelope<T>): Promise<void>
  deleteAppData(projectId: string, appId: string): Promise<void>
}
