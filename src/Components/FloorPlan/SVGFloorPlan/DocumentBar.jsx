import React, {useState, useCallback} from 'react'
import {getAllTemplates} from './templates/builtinTemplates'


/**
 * Document management bar for floor plan SVG.
 * Handles naming, template selection, opening saved docs, versioning.
 */
export default function DocumentBar({
  document,
  onNameChange,
  onTemplateChange,
  onScaleChange,
  onNewVersion,
  onOpen,
  onNew,
  saveStatus,
}) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [showOpenList, setShowOpenList] = useState(false)
  const templates = getAllTemplates()

  const startEditName = useCallback(() => {
    setEditName(document?.name || 'Untitled')
    setIsEditingName(true)
  }, [document])

  const finishEditName = useCallback(() => {
    setIsEditingName(false)
    if (editName.trim() && editName !== document?.name) {
      onNameChange(editName.trim())
    }
  }, [editName, document, onNameChange])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') finishEditName()
    if (e.key === 'Escape') setIsEditingName(false)
  }, [finishEditName])

  return (
    <div className='svg-floorplan-docbar'>
      {/* Document name */}
      <div className='docbar-name'>
        {isEditingName ? (
          <input
            type='text'
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={finishEditName}
            onKeyDown={handleKeyDown}
            autoFocus
            className='docbar-name-input'
          />
        ) : (
          <span onClick={startEditName} className='docbar-name-text' title='Click to rename'>
            {document?.name || 'Untitled'}
          </span>
        )}
        {document?.version > 1 && (
          <span className='docbar-version'>v{document.version}</span>
        )}
      </div>

      <div className='separator'/>

      {/* Actions */}
      <button onClick={onNewVersion} title='Create a named version snapshot'>
        Version
      </button>
      <button onClick={() => setShowOpenList(!showOpenList)}>
        Open
      </button>
      <button onClick={onNew}>
        New
      </button>

      <div className='separator'/>

      {/* Template */}
      <select
        value={document?.templateId || 'minimal'}
        onChange={(e) => onTemplateChange(e.target.value)}
        className='docbar-select'
        title='Page template'
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {/* Scale */}
      <select
        value={document?.scale || 100}
        onChange={(e) => onScaleChange(Number(e.target.value))}
        className='docbar-select'
        title='Drawing scale'
      >
        <option value={50}>1:50</option>
        <option value={100}>1:100</option>
        <option value={200}>1:200</option>
        <option value={500}>1:500</option>
      </select>

      {/* Save status */}
      <span className='docbar-status'>
        {saveStatus}
      </span>
    </div>
  )
}
