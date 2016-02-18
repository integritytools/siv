'use strict'
const Path = require('path')
const React = require('react')
const FileBoxDir = require('./file-box-dir')
const FileBoxFile = require('./file-box-file')

const FileBox = React.createClass({
  propTypes: {
    Id: React.PropTypes.number,
    height: React.PropTypes.number.isRequired,
    onClose: React.PropTypes.func.isRequired,
    onImgClick: React.PropTypes.func.isRequired,
    currentImg: React.PropTypes.string.isRequired,
    paths: React.PropTypes.object.isRequired
  },
  render () {
    const filesAndDirs = this.props.paths.map((path, index) => {
      switch (typeof path) {
        case 'string':
          return React.createElement(FileBoxFile, {
            key: index,
            path: path,
            currentImg: this.props.currentImg,
            onImgClick: this.props.onImgClick
          })
        case 'object':
          return React.createElement(FileBoxDir, {
            key: index,
            dirObj: path,
            currentImg: this.props.currentImg,
            onImgClick: this.props.onImgClick
          })
        default:
          return ''
      }
    })

    return React.DOM.div(
      {
        className: 'file-box',
        style: {height: this.props.height}
      },
      React.DOM.img(
        {
          src: 'icons/ic_close_black_18px.svg',
          onClick: () => this.props.onClose(this.props.Id)
        }
      ),
      React.DOM.ul(
        null,
        filesAndDirs
      )
    )
  }
})

module.exports = FileBox
