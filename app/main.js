// main.js - Electron Main Process
const { app, BrowserWindow, session, desktopCapturer, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Check if running in development mode
const isDev = !app.isPackaged;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = false;
autoUpdater.forceDevUpdateConfig = true;
autoUpdater.allowDowngrade = true;
let mainWindow;
let isMicMuted = false;
let isDeafened = false;

// Set App ID for Windows Notifications
if (process.platform === 'win32') {
  app.setAppUserModelId('com.natla.app');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 670,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets/gazmaliyim.ico')
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(err => {
      console.error("Ekran kaynakları alınamadı:", err);
    });
  });

}

// IPC Logic: Requests from Renderer
ipcMain.on('check-for-update', () => {
  // if (isDev) {
  // Return immediately in dev mode to prevent UI hang
  //mainWindow.webContents.send('update-not-available');
  // } else {
  autoUpdater.checkForUpdates();
  // }
});

ipcMain.on('start-download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('sync-mic-state', (event, muted) => {
  isMicMuted = muted;
});

ipcMain.on('sync-deafen-state', (event, deafened) => {
  isDeafened = deafened;
});

// AutoUpdater Events: Sending Info to Renderer

autoUpdater.on('checking-for-update', () => {
  log.info('Güncelleme kontrol ediliyor...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Güncelleme bulundu!');
  // Send version info
  mainWindow.webContents.send('update-available', info.version);
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Güncelleme yok.');
  mainWindow.webContents.send('update-not-available');
});

autoUpdater.on('error', (err) => {
  log.info('Güncelleme hatası: ' + err);
  mainWindow.webContents.send('update-error', err.toString());
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-available', (info) => {
  log.info('Güncelleme bulundu: ' + info.version);
  mainWindow.webContents.send('update-available', info.version);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('İndirme tamamlandı.');
  mainWindow.webContents.send('update-ready');
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Global Shortcuts
  globalShortcut.register('Ctrl+Shift+M', () => {
    if (isDeafened) {
      console.log('[Main] Ignored Ctrl+Shift+M: Speaker is closed (Deafened).');
    } else {
      if (mainWindow) mainWindow.webContents.send('toggle-mic');
      else console.warn('[Main] No mainWindow to send to.');
    }
  });

  globalShortcut.register('Ctrl+Shift+N', () => {
    if (mainWindow) {
      if (isDeafened && isMicMuted) {
        mainWindow.webContents.send('toggle-deafen');
        setTimeout(() => {
          mainWindow.webContents.send('toggle-mic');
        }, 25);
      } else {
        mainWindow.webContents.send('toggle-deafen');
      }
    } else {
      console.warn('[Main] No mainWindow to send to.');
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});