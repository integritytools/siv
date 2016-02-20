'use strict'
const electron = require('electron')
const minimist = require('minimist')
const path = require('path')
const fs = require('fs')
const auth = require('./auth')
const exts = require('./extensions')
const expandDirs = require('./expand-dirs')
const menuBar = require('./menu-bar')

function devToolsAuthorized (pass) {
  return pass === 'marek8'
}

// Anything added to the appState shouldn't get garbage collected
const appState = {
  userId: null,                 // for checkForKey
  trayIcon: null,
  downloadedExts: []
}

function logError (err) {
  // The logger should only be 'required' if there's an error.
  require('./logger').error(err)
}

var sivWindow = null

function makeTrayIcon (userId) {
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      type: 'normal',
      label: 'Shutdown SIV',
      click () {
        sivWindow.destroy()
        electron.app.quit()
      }
    },
    {type: 'separator'},
    {type: 'normal', label: `User: ${userId}`}
  ])

  const trayIcon = new electron.Tray(path.join(__dirname, 'icons', 'siv-icon-32x32.png'))
  trayIcon.setContextMenu(contextMenu)
  appState.trayIcon = trayIcon
}

function checkForKey () {
  auth.getSerialInfo()
    .then(serialNum => {
      electron.BrowserWindow.getAllWindows().forEach(win => {
        const keyFound = serialNum === appState.userId
        win.webContents.send('access-key-checked', keyFound)
      })
    })
}

const existingInstance = electron.app.makeSingleInstance((argv) => {
  const sivCLI = minimist(argv.slice(2), {boolean: true})
  if (sivCLI.help) {
    const logHelp = require('./cli-help')
    logHelp()
  }
  const pathsToOpen = sivCLI.singleFile ? [path.dirname(sivCLI._[0])] : sivCLI._
  const currentImg = sivCLI.singleFile ? sivCLI._[0] : undefined

  expandDirs(pathsToOpen)
    .then(filePaths => {
      sivWindow.webContents.send('file-paths-prepared', {
        filePaths,
        currentImg
      })
      if (sivWindow.isMinimized()) {
        sivWindow.restore()
        sivWindow.focus()
      } else {
        sivWindow.show()
      }
    })
    .catch(err => {
      console.log('Error expanding dirs: ', err)
    })
})

if (existingInstance) {
  electron.app.quit()
}

const sivCLI = minimist(process.argv.slice(2), {boolean: true})
if (sivCLI.help) {
  const logHelp = require('./cli-help')
  logHelp()
}
const pathsToOpen = sivCLI.singleFile ? [path.dirname(sivCLI._[0])] : sivCLI._
const currentImg = sivCLI.singleFile ? sivCLI._[0] : undefined

electron.app.on('ready', () => {
  // PREPARE SIV WINDOW
  electron.Menu.setApplicationMenu(menuBar)
  sivWindow = new electron.BrowserWindow({
    title: 'SIV',
    width: 1260,
    height: 800,
    show: false
  })
  sivWindow.on('close', event => {
    event.preventDefault()
    sivWindow.webContents.send('clear-file-paths')
    sivWindow.hide()
  })
  sivWindow.loadURL(`file://${__dirname}/siv.html`)

  // SEND FILE PATHS AND OPEN SIV IF APPLICABLE
  if (!sivCLI.start) {
    expandDirs(pathsToOpen)
      .then(filePaths => {
        sivWindow.webContents.on('did-finish-load', () => {
          sivWindow.webContents.send('file-paths-prepared', {
            filePaths,
            currentImg
          })
        })
        sivWindow.show()
        if ((sivCLI.dev || sivCLI.devTools) &&
            devToolsAuthorized(sivCLI.pass)) {
          sivWindow.webContents.openDevTools()
        }
      })
      .catch(err => {
        console.log('Error expanding dirs: ', err)
      })
  }

  // SIGN IN AND DOWNLOAD EXTENSIONS
  auth.getUserObject()
    .then(userObj => {
      if (sivCLI.dev) {
        userObj = {
          id: 'developer',
          extensions: [{name: 'caliper', id: 'GyMG'},
                       {name: 'sccir', id: 'G9Wd'}]
        }
      }
      if (userObj.id !== 'guest' &&
          userObj.id !== 'no-connection' &&
          userObj.id !== 'developer') {
        appState.userId = userObj.id
        setInterval(checkForKey, 3000)
      }
      makeTrayIcon(userObj.id)
      return userObj
    })
    .then(exts.download)
    .then(downloadedExts => {
      sivWindow.webContents.send('extensions-downloaded', downloadedExts)
      appState.downloadedExts = downloadedExts
    })
    .catch(err => {
      console.log('Error signing in or downloading extensions', err)
    })
})

electron.app.on('quit', () => {
  if (!sivCLI.dev) {            // keep in mind that
    // when you are in dev mode you don't want to
    // remove your working files when SIV shuts down
    appState.downloadedExts.forEach(extObj => {
      fs.unlinkSync(extObj.path)
    })
  }
})

electron.app.on('window-all-closed', (event) => {
  // The following prevents the app from quiting when all its windows
  // are closed:
  event.preventDefault()
})
