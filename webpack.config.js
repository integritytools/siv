const webpack = require('webpack')

module.exports = {
  entry: './app/siv/index.js',
  output: {
    path: `./app/siv/`,
    filename: 'index.bundle.js',
  },
  target: 'electron',
  node: {
    __dirname: false,
  },
}
