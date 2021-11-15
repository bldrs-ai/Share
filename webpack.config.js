const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const htmlPlugin = new HtmlWebpackPlugin({
  template: './public/index.html',
  filename: 'index.html',
});

const wasmPlugin = new CopyWebpackPlugin({
  patterns: [
    { from: 'node_modules/web-ifc/web-ifc.wasm', to: './static/js' },
    { from: 'public/haus.ifc', to: './haus.ifc' },
    { from: 'public/404.html', to: './404.html' }
  ],
});

module.exports = {
  entry: "./src/index.jsx",
  mode: 'production',
  output: {
    path: path.join(__dirname, '/docs'),
    filename: "[name].[contenthash].js",
    publicPath: '/Share',
    clean: true
  },
  devtool: 'source-map',
  module: {
    /** This is for web-ifc warning about cyclic deps. */
    exprContextCritical: false,
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: ['babel-loader'],
      },
      {
        test: /.svg$/,
        use: [
          {
            loader: 'svg-url-loader',
            options: {
              limit: 10000,
            },
          },
        ],
      },
      {
        test: /.(png|jpe?g|gif|ico)$/i,
        use: 'file-loader?name=[name].[ext]',
      },
    ],
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
  },
  devServer: {
    historyApiFallback: {
      // https://stackoverflow.com/questions/37271062/historyapifallback-doesnt-work-in-webpack-dev-server
      // Has to match the output directory.
      index: '/Share'
    }
  },
  plugins: [
    htmlPlugin,
    wasmPlugin,
    //    new BundleAnalyzerPlugin()
  ],
};
  /*
https://medium.com/hackernoon/the-100-correct-way-to-split-your-chunks-with-webpack-f8a9df5b7758
https://hackernoon.com/lessons-learned-code-splitting-with-webpack-and-react-f012a989113
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: Infinity,
      minSize: 0,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name(module) {
            // get the name. E.g. node_modules/packageName/not/this/part.js
            // or node_modules/packageName
            const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];

            // npm package names are URL-safe, but some servers don't like @ symbols
            return `npm.${packageName.replace('@', '')}`;
          },
        },
      },
    },
  }*/
