const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron'); 
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Geliştirme modunda olup olmadığımızı kontrol et
const isDev = !app.isPackaged;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = false; // Güncelleme bulununca otomatik indirsin ama kullanıcı "Yükle" deyince kurulsun
autoUpdater.forceDevUpdateConfig = true;
autoUpdater.allowDowngrade = true;
let mainWindow;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 650,
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

// --- IPC MANTIĞI: Renderer'dan Gelen İstekler ---
ipcMain.on('check-for-update', () => {
  // if (isDev) {
    // Geliştirme modunda butona basılırsa arayüzün asılı kalmaması için hemen cevap dönüyoruz
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

// --- AUTOUPDATER OLAYLARI: Renderer'a Bilgi Gönderme ---

autoUpdater.on('checking-for-update', () => {
  log.info('Güncelleme kontrol ediliyor...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Güncelleme bulundu!');
  mainWindow.webContents.send('update-available');
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
  log.info('Güncelleme bulundu!');
  mainWindow.webContents.send('update-available', info.version); 
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});