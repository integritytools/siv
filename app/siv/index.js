'use strict';

const ipcRenderer = require('electron').ipcRenderer;
const Path = require('path');
const React = require('react');
const ReactDOM = require('react-dom');
const h = require('react-hyperscript'); // pass down to exts
const Redux = require('redux');
const Sidebar = require('./sidebar');
const Btn = require('siv-components').btn;
const sivReducer = require('./reducer');
const navigateImages = require('./navigate-images');
const saveImage = require('./save-image');
const actions = require('./actions');

const SIV = React.createClass({
  propTypes: {
    store: React.PropTypes.object.isRequired,
  },
  componentWillMount() {
    ipcRenderer.on('save-image', (event, filePath) => {
      // filePath equals undefined on Cancel
      if (filePath) {
        const sivState = this.props.store.getState();
        saveImage(filePath,
                  sivState.canvasRefs,
                  sivState.viewerDimensions)
          .then(filePath => {
            this.props.store.dispatch({
              type: 'SAVE_TO_CURRENT_FILE_BOX',
              filePath: filePath,
            });
          })
          .catch(err => {
            console
              .error('There was an error writing the combined image to the file system:', err);
          });
      }
    });

    ipcRenderer.on('clear-file-paths', () => {
      this.props.store.dispatch({
        type: 'CLEAR_FILE_BOXES',
      });
    });

    ipcRenderer.on('file-paths-prepared', (event, prepared) => {
      const sivState = this.props.store.getState();
      if (sivState.fileBoxes.length <= 4) {
        this.props.store.dispatch({
          type: 'ADD_NEW_FILE_BOX',
          fileBox: prepared.filePaths,
        });
        const currentImgPath = (() => {
          if (prepared.currentImg) {
            return prepared.currentImg;
          }
          return prepared.filePaths.pathsList[0];
        })();
        this.props.store.dispatch({
          type: 'SET_CURRENT_IMG',
          imgPath: currentImgPath,
        });
      }
    });
  },

  componentDidMount() {
    // Render the app whenever its state changes
    this.props.store.subscribe(() => { this.forceUpdate(); });
    // The next few paragraphs ensure that the viewer dimensions are
    // saved whenever the app's window gets resized. The viewer
    // dimensions are used by extensions to set their layer
    // dimensions. The image extension also uses the information for
    // drawing an image so it fits into the viewer while maintaining
    // its aspect ratio.
    const saveViewerDimensions = () => {
      this.props.store.dispatch({
        type: 'SET_VIEWER_DIMENSIONS',
        dimensions: this.refs.viewerNode.getBoundingClientRect(),
      });
    };
    saveViewerDimensions();
    // Set the viewerSize once the window finishes resizing.
    // I initially wrote:
    // window.addEventListener('resize', this.setViewerDimensions)
    // But there was a noticeable amount of image flickering during a
    // window resize. Now, the image stretches with the window, then
    // fits into place once the window is done resizing.
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        saveViewerDimensions();
      }, 50);
    });
    // Defining the app's shortcuts
    window.addEventListener('keydown', keyPress => {
      const keyIdentifier = {
        Right: this.navigateToImg.bind(null, 'next', keyPress),
        Left: this.navigateToImg.bind(null, 'prev', keyPress),
      };
      const shortcut = keyIdentifier[keyPress.keyIdentifier];
      if (shortcut) shortcut();
    });
  },
  navigateToImg(direction, event) {
    // The direction param gets passed directly to navigateImages
    event.preventDefault();     // This prevents the file box from
                                // scolling horizontally when
                                // navigating with the arrow keys.
    const sivState = this.props.store.getState();
    const currentImg = sivState.currentImg;
    if (sivState.fileBoxes.length > 0) {
      const currentFileBox = sivState.fileBoxes[sivState.currentFileBox];
      const nextPath = navigateImages(direction, currentImg, currentFileBox.pathsList);
      this.props.store.dispatch({
        type: 'SET_CURRENT_IMG',
        imgPath: nextPath,
      });
    }
    // This logic is here, and not in a NAVIGATE_TO_IMG reducer
    // because setImage is async. TODO: no longer true
  },
  render() {
    const sivState = this.props.store.getState();
    const sivDispatch = this.props.store.dispatch;
    const dispatch = sivDispatch;

    const {
      store,
    } = this.props;

    const {
      layers,
      openedExtensions,
    } = store.getState();

    const closeFileBox = (fileBoxID) =>
      dispatch(actions.closeFileBox(fileBoxID));

    const setCurrentImg = (path) =>
      dispatch(actions.setCurrentImg(path));

    const closeExtension = (extensionID) =>
      dispatch(actions.closeExtension(extensionID));

    const toggleFilesShown = () =>
      dispatch(actions.toggleFilesShown());

    const layers = sivState.layers.map((Layer, index) => {
      const extStore = sivState.extStores[Layer.extId];
      return (
        <Layer
          key={index}
          zIndex={index + 1}
          sivState={sivState}
          sivDispatch={sivDispatch}
          extState={extStore ? extStore.getState() : undefined}
          extDispatch={extStore ? extStore.dispatch : undefined}
        />
      );
    });

    const activeLayer = sivState.layers[sivState.layers.length - 1];
    const extensions = sivState.installedExtensions;

    const extensionButtons = extensions.map((extInfo, index) => {
      const openExtension = () => {
        if (sivState.openedExts.indexOf(extInfo.id) === -1) {
          const ext = dynamicRequire(extInfo.path)(React, h);
          const extStore = Redux.createStore(ext.reducer);
          extStore.subscribe(this.forceUpdate.bind(this));
          sivDispatch({
            type: 'REGISTER_NEW_EXTENSION',
            id: extInfo.id,
            controls: ext.Controls,
            layer: ext.Layer,
            store: extStore,
          });
        } else {
          sivDispatch({
            type: 'ACTIVATE_LAYER',
            extId: extInfo.id,
          });
        }
      };
      return (
        <Btn
          key={index}
          btnType={'regular'}
          btnName={extInfo.name}
          onClick={openExtension}
          active={activeLayer ? activeLayer.extId === extInfo.id : false}
        />
      );
    });

    return (
      <div className="siv">
      <Sidebar
          sivState={sivState}
          sivDispatch={sivDispatch}
          extControls={sivState.extControls}
          viewerDimensions={sivState.viewerDimensions}
          fileBoxes={sivState.fileBoxes}
          currentImg={sivState.currentImg}
          extStores={sivState.extStores}
          filesShown={sivState.filesShown}
          extensionsControls={sivState.extControls}
          onExtensionClose={closeExtension}
          onFileBoxClose={closeFileBox}
          onFileClick={setCurrentImg}
          onFilesToggleClick={toggleFilesShown}
        />
        <div className="Viewer" ref="viewerNode">
          <div className="LayerContainer">
            {layers}
          </div>
        </div>
        <div className="Toolbar">
          <div className="Toolbar-section FileNav">
            <Btn
              btnType="blue"
              btnName="prev"
              onClick={this.navigateToImg.bind(null, 'prev')}
            />
            <Btn
              btnType="blue"
              btnName="next"
              onClick={this.navigateToImg.bind(null, 'next')}
            />
          </div>
          <div className="Toolbar-section ExtensionsNav">
            {extensionButtons}
          </div>
        </div>
      </div>
    );
  },
});

const sivStore = Redux.createStore(sivReducer);
const sivComponent = <SIV store={sivStore} />;
const siv = ReactDOM.render(sivComponent, document.getElementById('siv'));

const fs = require('fs');

fs.readFile(Path.resolve(`${__dirname}/../../extensions.json`), (err, data) => {
  if (err) {
    console.error('There was a problem reading extensions.json: ', err);
  } else {
    const extensions = JSON.parse(data);
    const firstExtension = dynamicRequire(extensions[0].path)(React, h);
    const firstExtensionStore = Redux.createStore(firstExtension.reducer);
    firstExtensionStore.subscribe(siv.forceUpdate.bind(siv));
    sivStore.dispatch({
      type: 'SET_AVAILABLE_EXTENSIONS',
      installedExtensions: extensions,
      id: extensions[0].id,
      controls: firstExtension.Controls,
      layer: firstExtension.Layer,
      store: firstExtensionStore,
    });
  }
});
