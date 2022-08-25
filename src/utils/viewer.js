import {Scene} from 'three'
import {
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCDOOR,
  IFCWINDOW,
  IFCFURNISHINGELEMENT,
  IFCMEMBER,
  IFCPLATE,
} from 'web-ifc'


// List of categories names
export const categories = {
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCFURNISHINGELEMENT,
  IFCDOOR,
  IFCWINDOW,
  IFCPLATE,
  IFCMEMBER,
}


/**
Get the name of a category based on the categories dictionary
 * @param {String} category
 * @return {String} Name of a category
 */
export function getName(category) {
  const names = Object.keys(categories)
  return names.find((name) => categories[name] === category)
}

/**
// Gets all the items of a category
 * @param {String} category
 * @param {Object} model
 * @return {String} all items of a category type
 */
export async function getAll(category, model) {
  console.log('get all is called')
  return model.ifcManager.getAllItemsOfType(0, category, false)
}

// Creates a new subset containing all elements of a category

/**
 * SideDrawer contains the ItemPanel and CommentPanel and allows for
 * show/hide from the right of the screen.
 * it is connected to the global store and controlled by isDrawerOpen property.
 * @param {String} category
 * @param {Object} model
 * @return {String} all items of a category type
 */
export async function newSubsetOfType(category, model) {
  const ids = await getAll(category, model)
  const scene = new Scene()
  console.log('in the new subset', ids )
  return model.ifcManager.createSubset({
    modelID: 0,
    scene,
    ids,
    removePrevious: true,
    customID: category.toString(),
  })
}

