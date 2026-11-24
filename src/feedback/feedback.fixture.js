import {act} from '@testing-library/react'
import useStore from '../store/useStore'


/* eslint-disable no-magic-numbers */
/**
 * A Share-hosted sample (route kind `project`, public by construction) and a
 * GitHub model, whose privacy the page can't know: the second's names must
 * never leave the page (feedbackView.js).
 */
export const PUBLIC_ROUTE = {kind: 'file', isUploadedFile: false, filepath: '/index.ifc',
  downloadUrl: new URL('https://bldrs.ai/index.ifc')}
export const PRIVATE_ROUTE = {kind: 'provider', provider: 'github', filepath: '/Tower B.ifc',
  gitpath: 'https://github.com/acme/secret/main/Tower B.ifc',
  downloadUrl: new URL('https://raw.githubusercontent.com/acme/secret/main/Tower%20B.ifc')}

/** A tree whose root carries a project name, which is withheld too for a private model. */
export const ROOT = {expressID: 1, Name: {value: 'Acme HQ'}, type: 'IFCPROJECT', children: [
  {expressID: 12, type: 'IFCWALL', children: []},
  {expressID: 13, type: 'IFCWALL', children: []},
]}

export const CAMERA = {getPosition: () => ({x: 10.123456, y: 5, z: -3}), getTarget: () => ({x: 0, y: 0, z: 0})}

/** The smallest record-shaped JPEG data URL. */
export const SCREENSHOT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP8='


/**
 * The store as feedbackView reads it: the public sample loaded, two walls
 * selected, a camera; `state` overrides.
 *
 * @param {object} [state]
 */
export function setFeedbackStore(state = {}) {
  act(() => useStore.setState({modelPath: PUBLIC_ROUTE, model: {format: 'ifc'}, indexedModel: null,
    rootElement: ROOT, viewer: null, selectedAnchorIds: [12, 13], cameraControls: CAMERA, appMetadata: {},
    ...state}))
}
