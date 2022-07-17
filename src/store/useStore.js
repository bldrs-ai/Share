import create from 'zustand'
import createIFCSlice from './IFCSlice'
import createIssuesSlice from './IssuesSlice'
import createUISlice from './UISlice'
import createRepositorySlice from './RepositorySlice'


const useStore = create((set, get) => ({
  ...createIFCSlice(set, get),
  ...createIssuesSlice(set, get),
  ...createRepositorySlice(set, get),
  ...createUISlice(set, get),
}))

export default useStore
