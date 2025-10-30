// These help with older browsers
import 'airbnb-js-shims/target/es2015'
import 'string.prototype.replaceall/auto'
import 'promise.allsettled/auto'

// TODO(pablo), detect for these features in a centralized location:
// OPFS → navigator.storage?.getDirectory
// OffscreenCanvas → OffscreenCanvas or transferControlToOffscreen
// WebGL2 → canvas.getContext('webgl2')
