const fontFamily = 'Helvetica'
const fontSize = 16
const fontWeight = '400'
const letterSpacing = 'normal'
const lineHeight = '1.5em'


/**
 * @return {object} Typography settings.
 */
export function getTypography() {
  return {
    fontFamily: fontFamily,
    fontSize: fontSize,
    letterSpacing: letterSpacing,
    lineHeight: lineHeight,
    h1: {fontSize: '1.3em', fontWeight},
    h2: {fontSize: '1.2em', fontWeight},
    h3: {fontSize: '1.1em', fontWeight: 400},
    h4: {fontSize: fontSize, fontWeight},
    h5: {fontSize: '.9em', lineHeight: '1.2em', fontWeight: 400},
    h6: {fontSize: '.8m', fontWeight: 500},
    body1: {fontSize, lineHeight, letterSpacing, fontWeight},
    body2: {fontSize, lineHeight, letterSpacing, fontWeight},
    tree: {fontSize, lineHeight, letterSpacing, fontWeight},
    propTitle: {fontSize, lineHeight, letterSpacing, fontWeight},
    propValue: {fontSize, lineHeight, letterSpacing, fontWeight: '300'},
  }
}
