import {WITHHELD_FILE, WITHHELD_LINK, WITHHELD_PATH, scrubLocations} from './textScrub'


describe('privacy/textScrub', () => {
  // Codex round 3 on #2313, and the forms the earlier rounds named.
  it.each([
    ['a standalone pathname', 'look at /private/Secret Project.glb now', `look at ${WITHHELD_PATH} ${WITHHELD_FILE} now`],
    ['a standalone folder', 'it is in /private/ somewhere', `it is in ${WITHHELD_PATH} somewhere`],
    ['a relative path', 'see models/tower/b.ifc.', `see ${WITHHELD_PATH}.`],
    ['a home path', 'from ~/Downloads today', `from ${WITHHELD_PATH} today`],
    ['a Windows path', 'saved to C:\\Users\\Jane\\Acme\\Tower.ifc yesterday', `saved to ${WITHHELD_PATH} yesterday`],
    ['a Windows path with a space in it', 'C:\\Users\\Jane\\My Models\\Tower.ifc', `${WITHHELD_PATH} ${WITHHELD_FILE}`],
    ['a UNC path', 'on \\\\fileserver\\projects\\acme here', `on ${WITHHELD_PATH} here`],
    ['a bare file name with spaces', 'Secret Project.glb has 3 meshes', `${WITHHELD_FILE} has 3 meshes`],
    ['a lowercase file name', 'opened tower-b.ifc twice', `opened ${WITHHELD_FILE} twice`],
    ['a quoted file name', 'the file "my secret project.step" opens', `the file "${WITHHELD_FILE}" opens`],
    ['an archive', 'unzip Acme.zip and Acme.glb.gz', `unzip ${WITHHELD_FILE} and ${WITHHELD_FILE}`],
    ['an https URL', 'from https://files.acme.example/private/Secret%20Project.glb?sig=abc.',
      `from ${WITHHELD_LINK}.`],
    ['an s3 URL', 'stored at s3://acme-bucket/models/tower.ifc', `stored at ${WITHHELD_LINK}`],
    ['a www host', 'see www.acme.example/models, please', `see ${WITHHELD_LINK}, please`],
    ['a Markdown link', 'here: [the model](https://acme.example/m.glb)', `here: [the model](${WITHHELD_LINK})`],
  ])('withholds %s', (_, text, expected) => {
    expect(scrubLocations(text)).toBe(expected)
  })

  it.each([
    ['plain prose', 'The model has 12 walls, 3 doors and a roof. Is it right?'],
    ['element refs', 'I selected e123, e45 and o1.2.3 for you.'],
    ['the assistant\'s ref: links', 'Here are [Wall 3](ref:e123) and [Kitchen](ref:e546633, ref:e546662).'],
    ['a scene-graph ref link', 'See [Door](ref:nScene/Mesh_3/Door).'],
    ['a single slash', 'Use and/or to combine, and w/o a cap.'],
    ['a date', 'Owner testing on 11/24/2026 found it.'],
    ['a bare extension in prose', 'An .ifc file or a STEP model, e.g. a glTF.'],
    ['numbers and units', 'It is 2.5 m tall, 3.0 x 4.5 m, at 45%.'],
    ['the precise layer\'s placeholder', 'Opened (model name withheld) fine.'],
  ])('leaves %s as written', (_, text) => {
    expect(scrubLocations(text)).toBe(text)
  })

  it('keeps an empty or missing text empty', () => {
    expect(scrubLocations('')).toBe('')
    expect(scrubLocations(undefined)).toBe('')
  })
})
