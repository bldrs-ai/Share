import {grey, green, orange} from '@mui/material/colors'


/**
 * @return {object} Color definitions: {grey, green, lime, black}
 * @see https://mui.com/customization/color/#color-palette
 */
export function getColors() {
  return {
    grey: {
      lightest: grey[100],
      light: grey[300],
      medium: '#C1C1C1',
      dark: '#444444',
      darkest: grey[900],
    },
    green: {
      lightest: '#CEE6CA',
      light: green[300],
      medium: green[500],
      dark: green[800],
      darkest: '#459A47',
    },
    lime: green[400],
    orange: orange[400],
    black: '#101010',
  }
}
