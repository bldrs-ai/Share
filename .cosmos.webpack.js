const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')


module.exports = {
  target: ['web', 'es2021'],
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
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
  plugins: [new HtmlWebpackPlugin()],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules\/(?!bldrs-conway)/,  // Exclude all of node_modules except bldrs-conway
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
