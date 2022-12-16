import create from "zustand";
import createIFCSlice from "./IFCSlice";
import createNotesSlice from "./NotesSlice";
import createUISlice from "./UISlice";
import createRepositorySlice from "./RepositorySlice";

const useStore = create((set, get) => ({
  ...createIFCSlice(set, get),
  ...createNotesSlice(set, get),
  ...createRepositorySlice(set, get),
  ...createUISlice(set, get),
}));

export default useStore;
