import {grey} from '@mui/material/colors'


/**
 * @return {object} Color definitions: {grey, green, lime, black}
 * @see https://mui.com/customization/color/#color-palette
 */
export function getColors() {
  return {
    grey: {
      white: '#ffffff',
      lightest: grey[50],
      light: grey[100],
      mediumlight: grey[200],
      medium: '#C1C1C1',
      mediumdark: grey[700],
      dark: grey[800],
      darkest: '#101010',
      black: '#000000',
    },
    blue: {
      lightest: '#ccccff',
      light: '#ccccff',
      medium: '#aaaaff',
      dark: '#8888ff',
      darkest: '#4444ff',
    },
  }
}
