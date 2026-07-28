// Deliberately dependency-free: the thumbnail generator
// (tools/thumbnails/generate.mjs) imports SAMPLE_MODELS from here under
// plain Node, which has no extensionless module resolution, so pulling in
// Filetype would drag the app's whole extensionless import graph into a
// build-time script. The only thing needed here is a file suffix, so
// `sampleFormat` parses it directly rather than calling
// `Filetype.getValidExtension` — see the note there.


/**
 * The Samples tab's model roster: display order, share paths and the
 * thumbnail asset each card shows.
 *
 * Extracted from SampleModels.jsx so the thumbnail generator
 * (tools/thumbnails/generate.mjs) reads the same list the UI renders —
 * a sample added here gets a thumbnail on the next generator run rather
 * than silently rendering a missing image.
 *
 * Each path may carry a `#c:` permalink camera. That hash is BOTH the
 * framing a user gets when they open the sample and the viewpoint its
 * thumbnail is shot from, so tuning one tunes both.
 *
 * To re-aim a sample: open it in the app, orbit to the angle you want,
 * copy the `#c:...` fragment out of the address bar into that entry's
 * `path` below, then re-shoot just that one:
 *
 *   node tools/thumbnails/generate.mjs --only Momentum
 *
 * (The generator caches models locally, so re-shoots after the first run
 * cost no test-models LFS bandwidth.) Entries with no `#c:` fragment
 * fall back to the viewer's auto-frame, which is centred but arbitrary
 * in angle and often leaves the model small in frame.
 *
 * Hosting note: everything under bldrs-ai/test-models is Git-LFS-backed,
 * so those samples draw on that repo's bandwidth quota. The other samples
 * (Swiss-Property-AG, OlegMoshkovich, webaverse) are plain git blobs
 * served without LFS. Robot_hand is the full right-hand assembly of
 * Pollen Robotics' AmazingHand (CC-BY-4.0), an Onshape AP242 export
 * mirrored into test-models; Robot is the Mixamo Y Bot rig with embedded
 * animation clips.
 */
export const SAMPLE_MODELS = [
  {
    name: 'Momentum',
    path: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
  },
  {
    name: 'Seestrasse',
    path: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
  },
  {
    name: 'Bldrs_plaza',
    path: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
  },
  {
    name: 'Gear',
    path: '/share/v/gh/bldrs-ai/test-models/main/step/zoo.dev/a-gear.step',
  },
  {
    name: 'Arty',
    path: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/digilent-arty-z7-xilinx-artix-7-soc-fpga-board-1.snapshot.1/Arty_Z7.stp',
  },
  {
    name: 'Jetengine',
    path: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/jet-engine-220.snapshot.1/Jetenginestep.stp',
  },
  {
    name: 'Robot_hand',
    path: '/share/v/gh/bldrs-ai/test-models/main/step/pollen-robotics/AmazingHand/Right_Hand.step',
  },
  {
    name: 'Robot',
    path: '/share/v/gh/webaverse/assets/master/animations/ybot.fbx',
  },
  {
    name: 'Caffeine',
    path: '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb',
  },
]


/**
 * Where the generated thumbnails are served from.
 *
 * They live in `public/static/thumbnails/`, which the build copies to
 * the site root verbatim — the same convention `public/static/js`
 * (draco, wasm) already uses. Root-absolute rather than a bundled
 * import because the app serves deep routes (`/share/v/gh/...`), and a
 * bundler-relative asset URL would resolve against the route instead of
 * the document root and 404.
 */
const THUMBNAIL_DIR = '/static/thumbnails'


/** File suffixes that name the same format as another suffix. */
const FORMAT_ALIASES = {
  STP: 'STEP',
}


/**
 * URL of a sample's generated thumbnail.
 *
 * Nothing verifies the file exists at build time (it isn't a bundled
 * import), so `SampleModels.test.jsx` asserts every roster entry has one
 * — that test is the guard against adding a sample without running
 * tools/thumbnails/generate.mjs.
 *
 * @param {string} name A SAMPLE_MODELS entry's name
 * @return {string} Root-absolute URL of the thumbnail
 */
export function thumbnailUrl(name) {
  return `${THUMBNAIL_DIR}/${name}.webp`
}


/**
 * The uppercased file type of a sample, for the card's format badge —
 * the Samples tab is curated for format diversity (IFC/STEP/FBX/PDB),
 * which is otherwise invisible to the user.
 *
 * Parses the suffix directly instead of calling
 * `Filetype.getValidExtension`, to keep this module importable from the
 * build-time thumbnail generator (see the note at the top). That's safe
 * here where the inputs are the curated paths above — for arbitrary
 * user-supplied paths, use Filetype, which also validates the type
 * against the supported set and handles type names appearing as
 * directory segments.
 *
 * @param {string} path A sample's share path
 * @return {string} e.g. 'IFC', 'STEP', 'FBX', 'PDB', or '' if unknown
 */
export function sampleFormat(path) {
  // Strip the camera hash first: '#c:...' is not part of the filename.
  const match = path.split('#')[0].match(/\.([a-z0-9]+)$/i)

  if (!match) {
    return ''
  }

  const extension = match[1].toUpperCase()

  // '.stp' and '.step' are the same format; badging them differently
  // reads as two formats in a gallery curated to show variety.
  return FORMAT_ALIASES[extension] || extension
}
