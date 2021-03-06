module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'google',
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:storybook/recommended',
  ],
  overrides: [{
    files: ['*.js', '*.mjs', '*.jsx'],
  }],
  parser: '@babel/eslint-parser',
  parserOptions: {
    babelOptions: {
      plugins: [
        '@babel/syntax-import-assertions',
      ],
    },
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    'import',
    'react',
    'jsx-a11y',
  ],
  rules: {
    'import/newline-after-import': ['error', {count: 2}],
    'max-len': ['error', 140],
    'no-irregular-whitespace': ['error'],
    'no-trailing-spaces': ['error'],
    'prefer-rest-params': 'off',
    'quote-props': ['error', 'consistent-as-needed'],
    'react/prop-types': 'off',
    'semi': ['error', 'never'],
    'arrow-spacing': ['error', {before: true, after: true}],
    'space-infix-ops': ['error'],
    'react/jsx-equals-spacing': [2, 'never'],
    'curly': ['error', 'all'],
    'default-case': 'warn',
    'default-param-last': ['error'],
    'eqeqeq': ['warn', 'always'],
    'no-alert': 'error',
    'no-empty-function': 'warn',
    'no-eq-null': 'warn',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-invalid-this': 'error',
    'no-lone-blocks': 'error',
    'no-lonely-if': 'error',
    'no-loop-func': 'error',
    'no-mixed-operators': 'warn',
    'no-magic-numbers': ['warn', {ignore: [-1, 0, 1], ignoreArrayIndexes: true, ignoreDefaultValues: true}],
    'no-multi-assign': ['error', {ignoreNonDeclaration: true}],
    'no-return-assign': 'error',
    'no-shadow': 'warn',
    'no-undef-init': 'error',
    'no-unneeded-ternary': 'warn',
    'no-unused-expressions': 'warn',
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'warn',
    'no-useless-return': 'error',
    'prefer-const': 'error',
    'prefer-template': 'warn',
    'yoda': 'error',
    'arrow-parens': ['error', 'always'],
    'block-spacing': 'error',
    'brace-style': 'error',
    'comma-style': ['error', 'last'],
    'eol-last': ['error', 'always'],
    'func-call-spacing': ['error', 'never'],
    'no-multiple-empty-lines': ['warn', {max: 2, maxEOF: 1}],
    'react/jsx-closing-bracket-location': 'warn',
  },
  settings: {
    react: {
      version: '17.0.2',
    },
  },
  reportUnusedDisableDirectives: true,
}
