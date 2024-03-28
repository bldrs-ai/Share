import create from 'zustand'
import createAppSlice from './AppSlice'
import createCameraSlice from './CameraSlice'
import createIFCSlice from './IFCSlice'
import createIsolatorSlice from './IfcIsolatorSlice'
import createNavTreeSlice from './NavTreeSlice'
import createNotesSlice from './NotesSlice'
import createOpenSlice from './OpenSlice'
import createPropertiesSlice from './PropertiesSlice'
import createRepositorySlice from './RepositorySlice'
import createSearchSlice from './SearchSlice'
import createSideDrawerSlice from './SideDrawerSlice'
import createUIEnabledSlice from './UIEnabledSlice'
import createUISlice from './UISlice'
import createVersionsSlice from './VersionsSlice'


const useStore = create((set, get) => ({
  ...createAppSlice(set, get),
  ...createCameraSlice(set, get),
  ...createIFCSlice(set, get),
  ...createIsolatorSlice(set, get),
  ...createNavTreeSlice(set, get),
  ...createNotesSlice(set, get),
  ...createOpenSlice(set, get),
  ...createPropertiesSlice(set, get),
  ...createRepositorySlice(set, get),
  ...createSearchSlice(set, get),
  ...createSideDrawerSlice(set, get),
  ...createUIEnabledSlice(set, get),
  ...createUISlice(set, get),
  ...createVersionsSlice(set, get),
}))

export default useStore
