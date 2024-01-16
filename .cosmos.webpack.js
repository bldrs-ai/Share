const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')


module.exports = {
  target: ['web', 'es2021'],
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'inline-source-map',
  devServer: {
    publicPath: '/cosmos/',
    contentBase: path.join(__dirname, 'docs'),
    compress: true,
    port: 8000,
  },
  output: {
    path: path.resolve(__dirname, 'docs'),
    publicPath: '/cosmos/',
    filename: 'index.html',
  },
  plugins: [new HtmlWebpackPlugin(), new webpack.EnvironmentPlugin({
    GITHUB_BASE_URL: 'nothing',
  })],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules\/(?!@bldrs-ai\\conway)/,  // Exclude all of node_modules except @bldrs-ai
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
          },
        },
      },
      {
        test: /\.svg$/i,
        use: {
          loader: '@svgr/webpack',
          options: {
            dimensions: false
          }
        }
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.svg'],
  },
  optimization: {
    minimize: false
  },
}
