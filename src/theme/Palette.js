import {getColors} from './Colors'


const colors = getColors()


export const day = {
  primary: {
    main: colors.grey.medium,
    background: colors.grey.light,
    contrastText: colors.black,
  },
  secondary: {
    main: colors.green.darkest,
    background: colors.green.lightest,
    contrastText: colors.green.dark,
  },
  scene: {
    background: colors.grey.lightest,
  },
}


export const night = {
  primary: {
    main: colors.grey.dark,
    background: colors.grey.darkest,
    contrastText: colors.grey.lightest,
  },
  secondary: {
    main: colors.green.lightest,
    background: colors.green.medium,
    contrastText: colors.green.lightest,
  },
  scene: {
    background: colors.black,
  },
}
