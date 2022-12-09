export const flags = [
  {
    name: 'authentication', isActive: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  },
]
