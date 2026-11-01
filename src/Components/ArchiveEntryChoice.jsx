import React, {ReactElement} from 'react'
import {List, ListItemButton, ListItemIcon, ListItemText} from '@mui/material'
import {InsertDriveFileOutlined as InsertDriveFileOutlinedIcon} from '@mui/icons-material'


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
  return (
    <>
      <p>This archive holds {entries.length} models Share can open. Choose one:</p>
      <List dense data-testid='archive-entry-list'>
        {entries.map((entry) => {
          const folder = entry.path.slice(0, entry.path.length - entry.name.length).replace(/\/$/, '')
          return (
            <ListItemButton
              key={entry.path}
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
      {revitTextSiblings.length > 0 && (
        // Agrees with the `.txt` guidance (`loader/formatGuidance.js`
        // TEXT_FILE): the .txt is the Revit export's sibling, not a model.
        <p>
          The .txt next to {revitTextSiblings.join(', ')} is the file Revit writes beside an IFC export,
          not a model, so it isn&apos;t listed. Open the .ifc.
        </p>
      )}
    </>
  )
}
