module.exports = {
  'stories': ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  'addons': ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions', 'storybook-addon-material-ui', 'storybook-addon-turbo-build'],
  'framework': {
    name: '@storybook/react-webpack5',
    options: {}
  },
  'features': {
    'modernInlineRender': true
  }
};