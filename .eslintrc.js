module.exports = {
  'env': {
    'browser': true,
    'es2021': true,
    'node': true,
    'jest': true,
  },
  'extends': [
    'google',
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    "plugin:jsx-a11y/recommended",
  ],
  'parserOptions': {
    'ecmaFeatures': {
      'jsx': true,
    },
    'ecmaVersion': 'latest',
    'sourceType': 'module',
  },
  'plugins': [
    'react',
    'jsx-a11y',
  ],
  'rules': {
    'react/prop-types': 'off',
    'semi': ['error', 'never'],
    'max-len': ['error', 100],
  },
  'settings': {
    'react': {
      'version': 'latest',
    },
  },
}
