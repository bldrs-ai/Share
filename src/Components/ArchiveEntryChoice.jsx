import React, {ReactElement} from 'react'
import {List, ListItemButton, ListItemIcon, ListItemText} from '@mui/material'
import {InsertDriveFileOutlined as InsertDriveFileOutlinedIcon} from '@mui/icons-material'


// Rows shown before the rest are counted instead. A bundle can hold
// thousands of models (one per part of an assembly), and a dialog of
// thousands of rows is no choice at all; fifty fits a scroll.
const MAX_LISTED_ENTRIES = 50
// `.ifc` names in the Revit-sibling note, at most.
const MAX_NAMED_SIBLINGS = 3


/**
 * The body of the entry chooser: a zip that holds several models Share can
 * open, one row per model, the first click opens it (`loader/modelArchive.js`,
 * Share#2006).
 *
 * Rows follow the ProjectsDrawer's model rows, the design system's nearest
 * list of files: the `InsertDriveFileOutlined` glyph, the file's name as the
 * label. The folder it sits in, inside the archive, is the secondary line,
 * so two `model.ifc` in different folders can be told apart.
 *
 * @property {Array<object>} entries The archive's model entries, each with a
 *   `path` (inside the archive) and a `name` (its last segment)
 * @property {Array<string>} revitTextSiblings Paths of the `.ifc` entries
 *   that have a same-named `.txt` beside them
 * @property {Function} onChoose Called with the chosen entry
 * @return {ReactElement}
 */
export default function ArchiveEntryChoice({entries, revitTextSiblings, onChoose}) {
  const listed = entries.slice(0, MAX_LISTED_ENTRIES)
  const unlisted = entries.length - listed.length
  const listedPaths = new Set(listed.map((entry) => entry.path))
  const siblings = revitTextSiblings.filter((path) => listedPaths.has(path)).slice(0, MAX_NAMED_SIBLINGS)
  return (
    <>
      <p>This archive holds {entries.length} models Share can open. Choose one:</p>
      <List dense data-testid='archive-entry-list'>
        {listed.map((entry, index) => {
          const folder = entry.path.slice(0, entry.path.length - entry.name.length).replace(/\/$/, '')
          return (
            <ListItemButton
              // An archive may hold two entries of one path; the index keeps
              // the keys apart.
              key={`${index}:${entry.path}`}
              onClick={() => onChoose(entry)}
              sx={{borderRadius: '10px'}}
              data-testid={`archive-entry-${entry.path}`}
            >
              <ListItemIcon sx={{minWidth: '2em'}}>
                <InsertDriveFileOutlinedIcon fontSize='small'/>
              </ListItemIcon>
              <ListItemText
                primary={entry.name}
                secondary={folder || null}
                primaryTypographyProps={{sx: {overflowWrap: 'anywhere'}}}
                secondaryTypographyProps={{sx: {overflowWrap: 'anywhere'}}}
              />
            </ListItemButton>
          )
        })}
      </List>
      {unlisted > 0 && (
        <p data-testid='archive-entry-unlisted'>
          And {unlisted} more. To open one of those, unpack the archive and open the model directly.
        </p>
      )}
      {siblings.length > 0 && (
        // Agrees with the `.txt` guidance (`loader/formatGuidance.js`
        // TEXT_FILE): the .txt is the Revit export's sibling, not a model.
        <p>
          The .txt next to {siblings.join(', ')} is the file Revit writes beside an IFC export,
          not a model, so it isn&apos;t listed. Open the .ifc.
        </p>
      )}
    </>
  )
}
