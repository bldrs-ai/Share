// const fontFamily = `"Roboto", "Helvetica", "Arial", sans-serif`
const fontFamily = `"Roboto", sans-serif`
const fontSize = 16
const fontWeight = 400
const letterSpacing = 'normal'
const lineHeight = 1.5


/**
 * @return {object} Typography settings.
 */
export function getTypography() {
  return {
    fontFamily: fontFamily,
    fontSize: fontSize,
    letterSpacing: letterSpacing,
    fontWeight: fontWeight,
    lineHeight: lineHeight,
    h1: {fontSize: 22, lineHeight, fontWeight},
    h2: {fontSize: 21, lineHeight, fontWeight},
    h3: {fontSize: 20, lineHeight, fontWeight},
    h4: {fontSize: 19, lineHeight, fontWeight},
    h5: {fontSize: 18, lineHeight, fontWeight: 400},
    h6: {fontSize: 17, lineHeight, fontWeight: 500},
    body1: {fontSize, lineHeight, letterSpacing, fontWeight},
    body2: {fontSize, lineHeight, letterSpacing, fontWeight},
    tree: {fontSize, lineHeight, letterSpacing, fontWeight},
    propTitle: {fontSize, lineHeight, letterSpacing, fontWeight: 300},
    propValue: {fontSize, lineHeight, letterSpacing, fontWeight},
  }
}
