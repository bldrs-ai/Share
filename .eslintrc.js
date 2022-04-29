module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  'extends': [
    'google',
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
    babelOptions: {
      plugins: [
        '@babel/syntax-import-assertions'
      ],
    },
  },
  plugins: [
    'react',
    'jsx-a11y',
  ],
  rules: {
    'max-len': ['error', 140],
    'no-irregular-whitespace': ['error'],
    'no-trailing-spaces': ['error'],
    'prefer-rest-params': 'off',
    'quote-props': ['error', 'consistent-as-needed'],
    'react/prop-types': 'off',
    'semi': ['error', 'never'],
  },
  settings: {
    react: {
      version: '17.0.2',
    },
  },
  reportUnusedDisableDirectives: true,
}
