export const flags = [
  {
    name: 'authentication', isActive: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  },
  {name: 'googleOAuth2', isActive: true},
  {name: 'googleDrive', isActive: true},
  // Multi-user sharing UI (Share dialog, visibility chip). Provider scaffolding
  // ships unconditionally; this flag gates the consumer surface in PR2+.
  // See design/new/multi-user-sharing.md.
  {name: 'sharing', isActive: false},
  // GitHub-as-Sources connection. The GitHubProvider, Netlify Functions and
  // /auth/gh/callback.html ship unconditionally; this flag gates the
  // SourcesTab "Connect GitHub" button + browse-via-connection wiring that
  // land in identity-decoupling PR2.
  // See design/new/identity-decoupling-decisions.md.
  {name: 'githubAsSource', isActive: false},
  // GLB runtime artifact pipeline (design/new/glb-model-sharing.md).
  // `glb` enables both the writer (post-IFC-parse cache warm-up) and the
  // reader (skip-IFC-when-GLB-cached fast path in Loader.js).
  {name: 'glb', isActive: false},
  // DRACOLoader wiring on the GLTFLoader. Off until the three.js upgrade
  // lands (Three 0.135 has a known DRACO regression). Independent of `glb`
  // so we can flip it on without enabling the broader serving pipeline.
  {name: 'glbDraco', isActive: false},
  // Verbose GLB writer/reader diagnostics (cache-key descriptor dump,
  // modelID, geometry size, chunk count). Top-level `[glb] writer/reader:`
  // milestone lines stay on whenever `glb` is on; this is the extra detail.
  {name: 'glbVerbose', isActive: false},
]


/**
 * Non-React feature-flag check. Mirrors `useExistInFeature` (in
 * src/hooks/useExistInFeature.js) but is usable from non-component modules
 * (loaders, services, etc.). A feature is enabled if its static flag has
 * `isActive: true` OR if the URL contains `?feature=<name>` (comma-separated
 * for multiple).
 *
 * Reads `window.location.search` directly, so this is a snapshot at call
 * time. Components that need to react to URL changes should use
 * `useExistInFeature` instead.
 *
 * @param {string} name Flag name (case-insensitive)
 * @return {boolean}
 */
export function isFeatureEnabled(name) {
  if (!name) {
    return false
  }
  const lowerName = name.toLowerCase()

  const staticFlag = flags.find((f) => f.name.toLowerCase() === lowerName)
  if (staticFlag?.isActive) {
    return true
  }

  if (typeof window === 'undefined' || !window.location) {
    return false
  }
  const enabledFeatures = new URLSearchParams(window.location.search).get('feature')
  if (!enabledFeatures) {
    return false
  }
  return enabledFeatures.split(',').some((f) => f.trim().toLowerCase() === lowerName)
}
