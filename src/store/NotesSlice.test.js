/* eslint-disable no-magic-numbers */
import createStore from 'zustand/vanilla'
import createNotesSlice from './NotesSlice'


/**
 * Build an isolated vanilla store containing only the NotesSlice. Each
 * test gets a fresh store so mutations in one test don't leak into the
 * next.
 *
 * @return {object} zustand vanilla store
 */
function makeStore() {
  return createStore((set, get) => createNotesSlice(set, get))
}


describe('store/NotesSlice', () => {
  describe('default state', () => {
    it('enables notes by default', () => {
      expect(makeStore().getState().isNotesEnabled).toBe(true)
    })

    it('leaves notes hidden by default (hash has no notes param)', () => {
      expect(makeStore().getState().isNotesVisible).toBe(false)
    })

    it('seeds comment/note state with sensible nulls and empty collections', () => {
      const state = makeStore().getState()
      expect(state.comments).toEqual([])
      expect(state.notes).toBeNull()
      expect(state.createdNotes).toBeNull()
      expect(state.deletedNotes).toBeNull()
      expect(state.selectedNoteId).toBeNull()
      expect(state.selectedCommentId).toBeNull()
      expect(state.markers).toEqual([])
      expect(state.editBodies).toEqual({})
      expect(state.editOriginalBodies).toEqual({})
      expect(state.editModes).toEqual({})
      expect(state.isCreateNoteVisible).toBe(false)
      expect(state.placeMarkMode).toBe(false)
    })
  })


  describe('enable / visibility setters', () => {
    it('setIsNotesEnabled flips the flag', () => {
      const store = makeStore()
      store.getState().setIsNotesEnabled(false)
      expect(store.getState().isNotesEnabled).toBe(false)
    })

    it('setIsNotesVisible sets the visibility', () => {
      const store = makeStore()
      store.getState().setIsNotesVisible(true)
      expect(store.getState().isNotesVisible).toBe(true)
    })

    it('toggleIsNotesVisible flips the current value', () => {
      const store = makeStore()
      expect(store.getState().isNotesVisible).toBe(false)
      store.getState().toggleIsNotesVisible()
      expect(store.getState().isNotesVisible).toBe(true)
      store.getState().toggleIsNotesVisible()
      expect(store.getState().isNotesVisible).toBe(false)
    })
  })


  describe('comment state', () => {
    it('setComments replaces the comments array', () => {
      const store = makeStore()
      const comments = [{id: 1, body: 'hi'}, {id: 2, body: 'there'}]
      store.getState().setComments(comments)
      expect(store.getState().comments).toEqual(comments)
    })

    it('signalCommentMutated toggles the signal', () => {
      const store = makeStore()
      const before = store.getState().commentMutatedSignal
      store.getState().signalCommentMutated()
      expect(store.getState().commentMutatedSignal).toBe(!before)
    })

    it('toggleAddComment flips addComment', () => {
      const store = makeStore()
      expect(store.getState().addComment).toBe(true)
      store.getState().toggleAddComment()
      expect(store.getState().addComment).toBe(false)
    })
  })


  describe('edit state keyed by noteId', () => {
    it('setEditBody merges a single id without clobbering others', () => {
      const store = makeStore()
      store.getState().setEditBody('note-1', 'first draft')
      store.getState().setEditBody('note-2', 'second draft')
      expect(store.getState().editBodies).toEqual({
        'note-1': 'first draft',
        'note-2': 'second draft',
      })
    })

    it('setEditOriginalBody merges by id', () => {
      const store = makeStore()
      store.getState().setEditOriginalBody('n1', 'original')
      expect(store.getState().editOriginalBodies).toEqual({n1: 'original'})
    })

    it('setEditMode merges by id', () => {
      const store = makeStore()
      store.getState().setEditMode('n1', true)
      store.getState().setEditMode('n2', false)
      expect(store.getState().editModes).toEqual({n1: true, n2: false})
    })

    it('overwriting a key preserves other keys', () => {
      const store = makeStore()
      store.getState().setEditBody('a', 'one')
      store.getState().setEditBody('b', 'two')
      store.getState().setEditBody('a', 'one-updated')
      expect(store.getState().editBodies).toEqual({a: 'one-updated', b: 'two'})
    })
  })


  describe('markers', () => {
    it('writeMarkers replaces the array', () => {
      const store = makeStore()
      store.getState().writeMarkers([{id: 'm1'}, {id: 'm2'}])
      expect(store.getState().markers).toEqual([{id: 'm1'}, {id: 'm2'}])
    })

    it('clearMarkers empties the array', () => {
      const store = makeStore()
      store.getState().writeMarkers([{id: 'm1'}])
      store.getState().clearMarkers()
      expect(store.getState().markers).toEqual([])
    })
  })


  describe('setDeletedNotes pruning of edit state', () => {
    it('removes the deleted note\'s entries from editBodies, editModes, and editOriginalBodies', () => {
      const store = makeStore()
      // Seed edit state for two notes
      store.getState().setEditBody('n1', 'first')
      store.getState().setEditBody('n2', 'second')
      store.getState().setEditMode('n1', true)
      store.getState().setEditMode('n2', false)
      store.getState().setEditOriginalBody('n1', 'first-orig')
      store.getState().setEditOriginalBody('n2', 'second-orig')

      // Delete n1
      store.getState().setDeletedNotes({id: 'n1'})

      const state = store.getState()
      expect(state.deletedNotes).toEqual({id: 'n1'})
      expect(state.editBodies).toEqual({n2: 'second'})
      expect(state.editModes).toEqual({n2: false})
      expect(state.editOriginalBodies).toEqual({n2: 'second-orig'})
    })

    it('leaves edit state untouched when deletedNotes is null (e.g. clearing the field)', () => {
      const store = makeStore()
      store.getState().setEditBody('n1', 'first')
      store.getState().setDeletedNotes(null)
      expect(store.getState().deletedNotes).toBeNull()
      expect(store.getState().editBodies).toEqual({n1: 'first'})
    })

    it('leaves edit state untouched when deletedNotes has no id (legacy/array shape)', () => {
      const store = makeStore()
      store.getState().setEditBody('n1', 'first')
      // The pre-existing parameterized test already passes an array
      // here; preserve that behavior — pruning only kicks in when
      // we get a concrete {id} payload.
      store.getState().setDeletedNotes([{id: 2}])
      expect(store.getState().editBodies).toEqual({n1: 'first'})
    })

    it('does nothing when the deleted id has no associated edit state', () => {
      const store = makeStore()
      store.getState().setEditBody('n1', 'first')
      store.getState().setDeletedNotes({id: 'unknown-note'})
      expect(store.getState().editBodies).toEqual({n1: 'first'})
      expect(store.getState().editModes).toEqual({})
      expect(store.getState().editOriginalBodies).toEqual({})
    })
  })


  describe('selected place mark in note', () => {
    it('setSelectedPlaceMarkInNoteIdData updates three fields at once', () => {
      const store = makeStore()
      store.getState().setSelectedPlaceMarkInNoteIdData('pm-7', '#c:1,2,3', true)
      const state = store.getState()
      expect(state.selectedPlaceMarkInNoteId).toBe('pm-7')
      expect(state.cameraHash).toBe('#c:1,2,3')
      expect(state.forceMarkerNoteSync).toBe(true)
    })
  })


  describe('simple setters', () => {
    it.each([
      ['setActiveNoteCardId', 'activeNoteCardId', 'card-1'],
      ['setBody', 'body', 'hello'],
      ['setCreatedNotes', 'createdNotes', [{id: 1}]],
      ['setDeletedNotes', 'deletedNotes', [{id: 2}]],
      ['setIssueBody', 'issueBody', 'issue text'],
      ['setNotes', 'notes', [{id: 1}, {id: 2}]],
      ['setSelectedNoteId', 'selectedNoteId', 42],
      ['setSelectedNoteIndex', 'selectedNoteIndex', 3],
      ['setSelectedCommentId', 'selectedCommentId', 99],
      ['setPlaceMark', 'placeMark', {x: 1, y: 2}],
      ['setIsPlaceMarkActivated', 'isPlaceMarkActivated', true],
      ['setPlaceMarkId', 'placeMarkId', 'pm-1'],
      ['setPlaceMarkMode', 'placeMarkMode', true],
      ['setSelectedPlaceMarkId', 'selectedPlaceMarkId', 'pm-2'],
      ['setIsCreateNoteVisible', 'isCreateNoteVisible', true],
    ])('%s updates %s', (setterName, key, value) => {
      const store = makeStore()
      store.getState()[setterName](value)
      expect(store.getState()[key]).toEqual(value)
    })
  })
})
