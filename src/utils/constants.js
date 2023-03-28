import {Color} from 'three'
import {Group} from 'three'
import {Vector3} from 'three'
import {Raycaster} from 'three'


export const FEATURE_PREFIX = 'f'
export const MOBILE_WIDTH = 500
export const MOBILE_HEIGHT = '70vh'
export const CAMERA_PREFIX = 'c'
export const PLACE_MARK_PREFIX = 'm'
export const PLACE_MARK_DISTANCE = 1
export const INACTIVE_PLACE_MARK_HEIGHT = 1
export const ACTIVE_PLACE_MARK_SCALE = 1.6
export const PLACE_MARK_SCALE_FACTOR = 80

export const raycaster = new Raycaster()
export const tempVec3 = new Vector3()
export const tempColor = new Color()
export const tempGroup = new Group()
