'use strict';

const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');

const directory = path.resolve(__dirname);

const common = {
  mode: 'development',
  entry: {
    'document-load': path.resolve(__dirname, 'examples/document-load/index.js'),
    meta: path.resolve(__dirname, 'examples/meta/index.js'),
    'user-interaction': path.resolve(__dirname, 'examples/user-interaction/index.js'),
    'page-view': path.resolve(__dirname, 'examples/page-view/index.js'),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // sourceMapFilename: '[file].map',
  },
  target: 'web',
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
        },
      },
    ],
  },
  resolve: {
    modules: [
      path.resolve(directory),
      'node_modules',
    ],
    extensions: ['.ts', '.js', '.jsx', '.json'],
  },
};

const devConfig = {
  devtool: 'eval-source-map',
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'examples'),
    },
    compress: true,
    port: 8090,
    hot: true,
    host: '0.0.0.0',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
  ],
};

module.exports = merge(common, devConfig);
