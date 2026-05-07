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
]
