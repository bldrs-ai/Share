import create from 'zustand'
import createIFCSlice from './IFCSlice'
import createNotesSlice from './NotesSlice'
import createUISlice from './UISlice'
import createUIVisibilitySlice from './UIVisibilitySlice'
import createRepositorySlice from './RepositorySlice'
import createIsolatorSlice from './IfcIsolatorSlice'
import createVersionsSlice from './VersionsSlice'


const useStore = create((set, get) => ({
  ...createIFCSlice(set, get),
  ...createNotesSlice(set, get),
  ...createRepositorySlice(set, get),
  ...createUISlice(set, get),
  ...createUIVisibilitySlice(set, get),
  ...createIsolatorSlice(set, get),
  ...createVersionsSlice(set, get),
}))

export default useStore
