import React from 'react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import NoteCard from './NoteCard'
import NoteCardCreate from './NoteCardCreate'
import NotesNavBar from './NotesNavBar'
import Notes from './Notes'


export default {
  NoteCard: (
    <StoreRouteThemeCtx>
      <NoteCard
        id={0}
        index={0}
        body={'body'}
        title={'title'}
        username={'username'}
        date={'12:00Z01-01-2024'}
      />
    </StoreRouteThemeCtx>
  ),
  NoteCardCreate: <StoreRouteThemeCtx><NoteCardCreate/></StoreRouteThemeCtx>,
  NotesNavBar: <StoreRouteThemeCtx><NotesNavBar/></StoreRouteThemeCtx>,
  Notes: <StoreRouteThemeCtx><Notes/></StoreRouteThemeCtx>,
}
