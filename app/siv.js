'use strict'
const ipcRenderer = require('electron').ipcRenderer
const React = require('react')
const ReactDOM = require('react-dom')
const Redux = require('redux')
const Sidebar = require('./sidebar')
const Btn = require('./component/button')
const PathInput = require('./path-input')
const sivReducer = require('./siv-reducer')
const sivEvents = require('./siv-events')
const setImage = require('./setImage')
const navigateImages = require('./navigateImages')
const save = require('./save')
const SIV = React.createClass({
  propTypes: {
    store: React.PropTypes.object.isRequired
  },

  getInitialState () {
    return {
      keyFound: true,
      pathInputShown: false
    }
  },
  componentWillMount () {
    ipcRenderer.on('save-image', (event, filePath) => {
      // filePath will be undefined if the user cancels out of the save dialog:
      if (filePath) {
        save.image(filePath, this.props.store)
      }
    })
    ipcRenderer.on('clear-file-paths', () => {
      this.props.store.dispatch({
        type: 'CLEAR_FILE_BOXES'
      })
    })
    ipcRenderer.on('file-paths-prepared', (event, prepared) => {
      this.props.store.dispatch({
        type: 'ADD_NEW_FILE_BOX',
        fileBox: prepared.filePaths
      })
      const currentImgPath = (() => {
        if (prepared.currentImg) {
          return prepared.currentImg
        }
        return prepared.filePaths.pathsList[0]
      })()
      setImage(currentImgPath, this.props.store.dispatch)
    })
    ipcRenderer.on('extensions-downloaded', (event, downloadedExts) => {
      this.props.store.dispatch(
        sivEvents.extsDownloaded(downloadedExts)
      )
    })
    ipcRenderer.on('access-key-checked', (event, keyFound) => {
      if (keyFound !== this.state.keyFound) {
        this.setState({keyFound})
      }
    })
  },
  componentDidMount () {
    this.props.store.subscribe(() => { this.forceUpdate() })
    const setDimensions = () => {
      const viewerDimensions = this.refs.viewerNode.getBoundingClientRect()
      this.props.store.dispatch(
        sivEvents.setViewerDimensions(viewerDimensions)
      )
    }
    setDimensions()
    // Set the viewerSize once the window finishes resizing.
    // I initially wrote:
    // window.addEventListener('resize', this.setViewerDimensions)
    // But there was a noticeable amount of image flickering during a
    // window resize. Now, the image stretches with the window, then
    // fits into place once the window is done resizing.
    let resizeTimer
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        setDimensions()
      }, 50)
    })
    window.addEventListener('keydown', keyPress => {
      const keyIdentifier = {
        Right: this.moveToNextImg.bind(null, keyPress),
        Left: this.moveToPrevImg.bind(null, keyPress)
      }
      const shortcut = keyIdentifier[keyPress.keyIdentifier]
      if (shortcut) shortcut()
    })
  },
  moveToNextImg (event) {
    event.preventDefault()
    const sivState = this.props.store.getState()
    const currentImg = sivState.currentImg
    if (sivState.fileBoxes.length > 0) {
      const currentFileBox = sivState.fileBoxes[sivState.currentFileBox]
      const nextPath = navigateImages('next', currentImg, currentFileBox.pathsList)
      setImage(nextPath, this.props.store.dispatch)
    }
  },
  moveToPrevImg (event) {
    event.preventDefault()
    const sivState = this.props.store.getState()
    const currentImg = sivState.currentImg
    if (sivState.fileBoxes.length > 0) {
      const currentFileBox = sivState.fileBoxes[sivState.currentFileBox]
      const nextPath = navigateImages('prev', currentImg, currentFileBox.pathsList)
      setImage(nextPath, this.props.store.dispatch)
    }
  },
  render () {
    const sivState = this.props.store.getState()
    const sivDispatch = this.props.store.dispatch
    const renderKeyNotFoundMsg = () => {
      const msg = `The key used to open SIV can no longer be detected.
          If you'd like to continue using SIV, shut it down from the
          notifications tray and reopen it as a guest.`
      return React.createElement(
        'div',
        { className: 'key-not-found' },
        msg
      )
    }
    const renderLayers = () => {
      return sivState.layers.map((Layer, index) => {
        const extStore = sivState.extStores[Layer.extId]
        return React.createElement(Layer, {
          key: index,
          zIndex: index + 1,
          sivState: sivState,
          sivDispatch: sivDispatch,
          extState: extStore ? extStore.getState() : undefined,
          extDispatch: extStore ? extStore.dispatch : undefined })
      })
    }
    const activeLayer = sivState.layers[sivState.layers.length - 1]
    const downloadedExts = sivState.downloadedExts
    const renderExtButtons = () => {
      if (downloadedExts.length > 0) {
        return downloadedExts.map((extInfo, index) => {
          const openExtension = () => {
            if (sivState.openedExts.indexOf(extInfo.id) === -1) {
              const ext = require(extInfo.path)
              const extStore = (() => {
                if (ext.reducer) {
                  const newStore = Redux.createStore(ext.reducer)
                  newStore.subscribe(this.forceUpdate.bind(this))
                  return newStore
                }
                return undefined
              })()
              sivDispatch(
                sivEvents.newExtOpened({
                  id: extInfo.id,
                  controls: ext.Controls,
                  layer: ext.Layer,
                  store: extStore
                })
              )
            } else {
              sivDispatch(
                sivEvents.activateLayerRequested(extInfo.id)
              )
            }
          }
          return React.createElement(
            Btn, { key: index,
                   btnType: 'regular',
                   btnName: extInfo.name,
                   onClick: openExtension,
                   active: activeLayer.extId === extInfo.id }
          )
        })
      } else {
        return ''
      }
    }
    const hideShowPathInput = () => {
      this.setState({ pathInputShown: !this.state.pathInputShown })
    }
    return React.DOM.div(
      {
        className: 'siv'
      },
      this.state.keyFound ? '' : renderKeyNotFoundMsg(),
      React.createElement(Sidebar, {
        sivState: sivState,
        sivDispatch: sivDispatch
      }),
      React.DOM.div(
        {
          className: 'Viewer',
          ref: 'viewerNode'
        },
        React.DOM.div(
          {
            id: 'PathInput-control',
            className: this.state.pathInputShown ? 'open' : '',
            role: 'button',
            onClick: hideShowPathInput
          },
          React.createElement('img', { src: 'icons/ic_expand_more_black_24px.svg' })
        ),
        React.createElement(PathInput, {
          pathInputShown: this.state.pathInputShown,
          sivState: sivState,
          sivDispatch: sivDispatch
        }),
        React.DOM.div(
          {
            className: 'LayerContainer'
          },
          renderLayers()
        )
      ),
      React.DOM.div(
        {
          className: 'Toolbar'
        },
        React.DOM.div(
          {
            className: 'Toolbar-section FileNav'
          },
          React.createElement(
            Btn, {btnType: 'blue', btnName: 'prev', onClick: this.moveToPrevImg}
          ),
          React.createElement(
            Btn, {btnType: 'blue', btnName: 'next', onClick: this.moveToNextImg}
          )
        ),
        React.DOM.div(
          {
            className: 'Toolbar-section ExtensionsNav'
          },
          renderExtButtons()
        )
      )
    )
  }
})

const sivComponent = React.createElement(SIV, {
  store: Redux.createStore(sivReducer)
})

ReactDOM.render(sivComponent, document.getElementById('siv'))
